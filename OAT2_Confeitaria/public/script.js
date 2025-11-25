const API = 'http://localhost:3000';
let receitaTemp = [];
let produtoEmEdicaoId = null; // Variável para controlar se estamos editando ou criando

window.onload = () => { carregarTudo(); };

function mudarAba(aba) {
    document.querySelectorAll('.secao').forEach(el => el.classList.add('d-none'));
    document.getElementById(`aba-${aba}`).classList.remove('d-none');
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');

    // Dentro da função mudarAba...
    
    if(aba === 'relatorio') {
        // Define o mês atual como padrão no input
        const hoje = new Date();
        const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
        const inputMes = document.getElementById('filtro-mes');
        
        // Só define se estiver vazio (para não perder o que o usuário selecionou)
        if(!inputMes.value) {
            inputMes.value = mesAtual;
            buscarRelatorioMensal(); // Já busca os dados do mês atual automaticamente
        }
    } else {
        carregarTudo();
    }
}

async function carregarTudo() {
    // 1. Dashboard
    const dash = await (await fetch(API + '/dashboard')).json();
    document.getElementById('dash-faturamento').innerText = `R$ ${dash.faturamento.toFixed(2)}`;
    document.getElementById('dash-lucro').innerText = `R$ ${dash.lucro.toFixed(2)}`;
    const elQtd = document.getElementById('dash-qtd');
    if(elQtd) elQtd.innerText = dash.qtdVendas || 0;

    // 2. Insumos
    const insumos = await (await fetch(API + '/insumos')).json();
    document.getElementById('lista-insumos').innerHTML = insumos.map(i => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
            <div>
                <strong>${i.nome}</strong> <small>(R$ ${i.custo_unitario})</small>
            </div>
            <div>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editarEstoque('${i._id}', '${i.nome}')">
                    Estoque: ${i.estoque_atual}
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="apagarInsumo('${i._id}')">🗑️</button>
            </div>
        </li>`).join('');
    
    // Select de Receita
    const opcoes = insumos.map(i => `<option value="${i._id}">${i.nome}</option>`).join('');
    document.getElementById('sel-insumo-receita').innerHTML = opcoes;

    // 3. Produtos (Com botão de EDITAR)
    const produtos = await (await fetch(API + '/produtos')).json();
    document.getElementById('lista-produtos').innerHTML = produtos.map(p => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
            <div>
                <b>${p.nome}</b><br>
                <small>Venda: R$ ${p.preco_venda} | Custo: R$ ${p.custo_producao}</small>
            </div>
            <div>
                <button class="btn btn-sm btn-outline-warning me-1" onclick="iniciarEdicaoProduto('${p._id}')">✏️ Editar</button>
                <button class="btn btn-sm btn-outline-danger" onclick="apagarProduto('${p._id}')">🗑️</button>
            </div>
        </li>`).join('');
    
    document.getElementById('sel-prod-venda').innerHTML = produtos.map(p => `<option value="${p._id}">${p.nome}</option>`).join('');
}

// --- RELATÓRIO ---
async function carregarRelatorioDetalhado() {
    const res = await fetch(API + '/relatorio-vendas');
    const dados = await res.json();
    const lista = document.getElementById('lista-mais-vendidos');
    
    if(!dados || dados.length === 0) {
        lista.innerHTML = '<li class="list-group-item text-center">Nenhuma venda registrada ou erro ao carregar. Tente realizar uma nova venda.</li>';
        return;
    }
    lista.innerHTML = dados.map((item, index) => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
            <span class="fw-bold">#${index + 1} ${item._id}</span>
            <span class="badge bg-primary rounded-pill">${item.qtdTotal} un</span>
        </li>`).join('');
}

// --- LÓGICA DE PRODUTOS (CRIAR E EDITAR) ---

// Adiciona ingrediente na memória (receitaTemp)
function addIngrediente() {
    const sel = document.getElementById('sel-insumo-receita');
    const qtd = document.getElementById('qtd-uso').value;
    if(!qtd) return alert("Digite a quantidade!");

    // Adiciona na lista temporária
    receitaTemp.push({
        insumo_id: sel.value,
        nome_insumo: sel.options[sel.selectedIndex].text,
        qtd_necessaria: parseFloat(qtd)
    });
    
    atualizarListaReceitaVisual();
    document.getElementById('qtd-uso').value = '';
}

// Remove ingrediente da memória
function removerIngredienteReceita(index) {
    receitaTemp.splice(index, 1); // Remove item do array
    atualizarListaReceitaVisual();
}

function atualizarListaReceitaVisual() {
    const lista = document.getElementById('lista-receita-temp');
    if (receitaTemp.length === 0) {
        lista.innerHTML = '<li class="list-group-item small text-muted">Nenhum ingrediente selecionado</li>';
        return;
    }
    
    lista.innerHTML = receitaTemp.map((item, index) => `
        <li class="list-group-item d-flex justify-content-between align-items-center p-1">
            <small>${item.nome_insumo} (Qtd: ${item.qtd_necessaria})</small>
            <button class="btn btn-sm btn-danger py-0" onclick="removerIngredienteReceita(${index})">x</button>
        </li>
    `).join('');
}

// Função chamada ao clicar no botão Lápis (✏️)
async function iniciarEdicaoProduto(id) {
    // Busca os dados do produto
    const res = await fetch(API + '/produtos/' + id);
    const produto = await res.json();

    // Preenche o formulário lá em cima
    document.getElementById('nome-prod').value = produto.nome;
    document.getElementById('preco-prod').value = produto.preco_venda;
    
    // Carrega a receita existente na memória
    receitaTemp = produto.receita.map(r => ({
        insumo_id: r.insumo_id,
        nome_insumo: r.nome_insumo, // Se vier undefined do banco, pode dar bug visual, mas a lógica funciona
        qtd_necessaria: r.qtd_necessaria
    }));
    
    // Atualiza visual
    atualizarListaReceitaVisual();

    // Muda o estado para EDIÇÃO
    produtoEmEdicaoId = id;
    const btnSalvar = document.querySelector('#aba-prod button.btn-primary'); // Botão de salvar
    btnSalvar.innerText = "💾 Salvar Alterações";
    btnSalvar.classList.remove('btn-primary');
    btnSalvar.classList.add('btn-warning');
    
    // Rola a tela para cima
    document.querySelector('#aba-prod').scrollIntoView({ behavior: 'smooth' });
}

// Função ÚNICA para salvar (decide se cria ou edita)
async function salvarProduto() {
    const nome = document.getElementById('nome-prod').value;
    const preco = document.getElementById('preco-prod').value;
    if(!nome || !preco) return alert("Preencha nome e preço!");

    const payload = { nome, preco_venda: preco, receita: receitaTemp };
    
    if (produtoEmEdicaoId) {
        // MODO EDIÇÃO (PUT)
        await fetch(`${API}/produtos/${produtoEmEdicaoId}`, {
            method: 'PUT', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        alert('Produto Atualizado com Sucesso!');
    } else {
        // MODO CRIAÇÃO (POST)
        await fetch(API + '/produtos', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        alert('Produto Criado!');
    }
    
    // Limpa tudo e reseta o formulário
    resetarFormularioProduto();
    carregarTudo();
}

function resetarFormularioProduto() {
    document.getElementById('nome-prod').value = '';
    document.getElementById('preco-prod').value = '';
    receitaTemp = [];
    atualizarListaReceitaVisual();
    produtoEmEdicaoId = null;
    
    // Volta botão ao normal
    const btnSalvar = document.querySelector('#aba-prod button.btn-warning');
    if(btnSalvar) {
        btnSalvar.innerText = "Criar Produto";
        btnSalvar.classList.remove('btn-warning');
        btnSalvar.classList.add('btn-primary');
    }
}

// --- OUTRAS AÇÕES ---

async function salvarInsumo() {
    const nome = document.getElementById('nome-ins').value;
    const custo = document.getElementById('custo-ins').value;
    const est = document.getElementById('est-ins').value;
    if(!nome || !custo || !est) return alert("Preencha tudo!");

    await fetch(API + '/insumos', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ nome, custo_unitario: custo, estoque_atual: est })
    });
    alert('Insumo Salvo!'); 
    document.getElementById('nome-ins').value = '';
    carregarTudo();
}

async function editarEstoque(id, nome) {
    const novoQtd = prompt(`Novo estoque para ${nome}:`);
    if (novoQtd) {
        await fetch(`${API}/insumos/${id}`, {
            method: 'PUT', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ novoEstoque: parseFloat(novoQtd) })
        });
        carregarTudo();
    }
}

async function apagarInsumo(id) {
    if(confirm("Apagar insumo?")) {
        await fetch(`${API}/insumos/${id}`, { method: 'DELETE' });
        carregarTudo();
    }
}

async function apagarProduto(id) {
    if(confirm("Apagar produto?")) {
        await fetch(`${API}/produtos/${id}`, { method: 'DELETE' });
        carregarTudo();
    }
}

async function vender() {
    const prodId = document.getElementById('sel-prod-venda').value;
    const qtd = document.getElementById('qtd-venda').value;
    if(!prodId) return alert("Selecione um produto!");

    const res = await fetch(API + '/vendas', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ produto_id: prodId, qtd: qtd })
    });

    const data = await res.json();
    if (!res.ok) alert("❌ " + data.erro);
    else {
        alert('✅ Venda Realizada!');
        mudarAba('venda');
    }
}

// --- NOVA FUNÇÃO: BUSCAR RELATÓRIO MENSAL ---
async function buscarRelatorioMensal() {
    const mesSelecionado = document.getElementById('filtro-mes').value;
    
    if (!mesSelecionado) return;

    // Chama o backend enviando o mês (ex: ?mes=2025-11)
    const res = await fetch(`${API}/relatorio-mensal?mes=${mesSelecionado}`);
    const dados = await res.json();

    // 1. Atualiza o Faturamento na tela
    document.getElementById('rel-faturamento').innerText = `R$ ${dados.faturamento.toFixed(2)}`;

    // 2. Atualiza a lista de produtos
    const lista = document.getElementById('lista-relatorio-mes');
    
    if (dados.listaProdutos.length === 0) {
        lista.innerHTML = '<li class="list-group-item text-center text-muted">Nenhuma venda neste mês.</li>';
        return;
    }

    lista.innerHTML = dados.listaProdutos.map(item => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
            <span>${item._id}</span>
            <span class="badge bg-primary rounded-pill">${item.qtd} un</span>
        </li>
    `).join('');
}