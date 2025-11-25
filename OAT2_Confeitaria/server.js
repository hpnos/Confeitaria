const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

mongoose.connect('mongodb://localhost:27017/confeitaria_db')
    .then(() => console.log("✅ MongoDB Conectado!"))
    .catch(err => console.error("❌ Erro no Mongo:", err));

// --- SCHEMAS ---
const InsumoSchema = new mongoose.Schema({
    nome: String,
    custo_unitario: Number,
    estoque_atual: Number
});

const ProdutoSchema = new mongoose.Schema({
    nome: String,
    preco_venda: Number,
    custo_producao: Number,
    receita: [{
        insumo_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Insumo' },
        nome_insumo: String,
        qtd_necessaria: Number
    }]
});

const VendaSchema = new mongoose.Schema({
    data: { type: Date, default: Date.now },
    itens: Array,
    total_venda: Number,
    lucro_estimado: Number
});

const Insumo = mongoose.model('Insumo', InsumoSchema);
const Produto = mongoose.model('Produto', ProdutoSchema);
const Venda = mongoose.model('Venda', VendaSchema);

// --- ROTAS GET ---
app.get('/insumos', async (req, res) => res.json(await Insumo.find()));
app.get('/produtos', async (req, res) => res.json(await Produto.find()));
app.get('/produtos/:id', async (req, res) => res.json(await Produto.findById(req.params.id))); // Rota nova para buscar 1 produto

app.get('/dashboard', async (req, res) => {
    // 1. Definir o início e fim do mês atual para o filtro
    const dataAtual = new Date();
    const inicioMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth(), 1);
    const fimMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth() + 1, 0, 23, 59, 59);

    const stats = await Venda.aggregate([
        {
            // O FILTRO MÁGICO: Só pega vendas cuja data seja >= inicioMes E <= fimMes
            $match: {
                data: {
                    $gte: inicioMes, 
                    $lte: fimMes
                }
            }
        },
        {
            $group: { 
                _id: null, 
                faturamento: { $sum: "$total_venda" }, 
                lucro: { $sum: "$lucro_estimado" },
                qtdVendas: { $sum: 1 }
            }
        }
    ]);
    
    // Retorna os dados (ou zeros se não tiver venda neste mês)
    res.json(stats[0] || { faturamento: 0, lucro: 0, qtdVendas: 0 });
});

// Rota de Relatório Corrigida
app.get('/relatorio-vendas', async (req, res) => {
    try {
        console.log("Gerando relatório...");
        const relatorio = await Venda.aggregate([
            { $unwind: "$itens" }, // Desmonta o array de itens
            { 
                $group: { 
                    _id: "$itens.nome", // Agrupa pelo nome do item
                    qtdTotal: { $sum: "$itens.qtd" } // Soma a quantidade
                } 
            },
            { $sort: { qtdTotal: -1 } }
        ]);
        console.log("Relatório gerado:", relatorio);
        res.json(relatorio);
    } catch (error) {
        console.error("Erro relatório:", error);
        res.json([]);
    }
});

// --- ROTAS POST (Criação) ---
app.post('/insumos', async (req, res) => {
    await new Insumo(req.body).save();
    res.json({ ok: true });
});

app.post('/produtos', async (req, res) => {
    let custoTotal = 0;
    const receita = req.body.receita || [];
    
    for (let item of receita) {
        const ins = await Insumo.findById(item.insumo_id);
        if(ins) custoTotal += (ins.custo_unitario * item.qtd_necessaria);
    }
    
    const prod = new Produto({ ...req.body, custo_producao: parseFloat(custoTotal.toFixed(2)) });
    await prod.save();
    res.json(prod);
});

// --- ROTA DE VENDA ---
app.post('/vendas', async (req, res) => {
    const { produto_id, qtd } = req.body;
    const produto = await Produto.findById(produto_id);
    
    if(!produto) return res.status(404).json({erro: "Produto não achado"});

    // Verifica Estoque
    for(let itemReceita of produto.receita) {
        const insumoNoBanco = await Insumo.findById(itemReceita.insumo_id);
        const qtdNecessariaTotal = itemReceita.qtd_necessaria * qtd;
        if (!insumoNoBanco || insumoNoBanco.estoque_atual < qtdNecessariaTotal) {
            return res.status(400).json({ 
                erro: `Estoque insuficiente de ${itemReceita.nome_insumo}! Precisa de ${qtdNecessariaTotal}.` 
            });
        }
    }

    // Baixa Estoque
    for(let itemReceita of produto.receita) {
        await Insumo.findByIdAndUpdate(itemReceita.insumo_id, {
            $inc: { estoque_atual: -(itemReceita.qtd_necessaria * qtd) }
        });
    }

    // Registra Venda
    const lucro = (produto.preco_venda - produto.custo_producao) * qtd;
    await new Venda({
        itens: [{ nome: produto.nome, qtd: parseFloat(qtd) }],
        total_venda: produto.preco_venda * qtd,
        lucro_estimado: lucro
    }).save();

    res.json({ ok: true });
});

// --- ROTAS DE EDIÇÃO E REMOÇÃO ---

app.delete('/insumos/:id', async (req, res) => {
    await Insumo.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
});

app.put('/insumos/:id', async (req, res) => {
    await Insumo.findByIdAndUpdate(req.params.id, { estoque_atual: req.body.novoEstoque });
    res.json({ ok: true });
});

app.delete('/produtos/:id', async (req, res) => {
    await Produto.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
});

// NOVA ROTA: Editar Produto Completo (Nome, Preço e Receita)
app.put('/produtos/:id', async (req, res) => {
    const { nome, preco_venda, receita } = req.body;
    let custoTotal = 0;
    
    // Recalcula o custo com a NOVA receita
    for (let item of receita) {
        const ins = await Insumo.findById(item.insumo_id);
        if(ins) custoTotal += (ins.custo_unitario * item.qtd_necessaria);
    }

    await Produto.findByIdAndUpdate(req.params.id, {
        nome,
        preco_venda,
        custo_producao: parseFloat(custoTotal.toFixed(2)),
        receita
    });
    res.json({ ok: true });
});

// Relatório Mensal Específico 
app.get('/relatorio-mensal', async (req, res) => {
    const { mes } = req.query; // Recebe algo como "2025-11"
    
    if (!mes) return res.json({ erro: "Selecione um mês" });

    // 1. Calcula o intervalo de datas (Primeiro e Último dia do mês escolhido)
    const [ano, mesNum] = mes.split('-');
    const inicio = new Date(ano, mesNum - 1, 1);
    const fim = new Date(ano, mesNum, 0, 23, 59, 59);

    const resultado = await Venda.aggregate([
        // Filtra só as vendas daquele mês
        { $match: { data: { $gte: inicio, $lte: fim } } },
        
        {
            $facet: {
                // Cálculo 1: Faturamento Total do Mês
                totais: [
                    { $group: { _id: null, faturamento: { $sum: "$total_venda" } } }
                ],
                // Cálculo 2: Lista de Produtos Vendidos
                produtos: [
                    { $unwind: "$itens" },
                    { $group: { _id: "$itens.nome", qtd: { $sum: "$itens.qtd" } } },
                    { $sort: { qtd: -1 } }
                ]
            }
        }
    ]);

    // Organiza o retorno para o Front
    const dados = resultado[0];
    res.json({
        faturamento: dados.totais[0] ? dados.totais[0].faturamento : 0,
        listaProdutos: dados.produtos
    });
});

app.listen(3000, () => console.log('🚀 Servidor rodando em http://localhost:3000'));