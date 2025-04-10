const API_URL = 'https://x8ki-letl-twmt.n7.xano.io/api:4OHEwWeq';
let currentSkus = [];
let numeracoes = [];
let pedidosCache = new Map();

document.addEventListener('DOMContentLoaded', () => {
    verificarAcesso();
    carregarLojaAutomaticamente();
});

async function fazerLogin(email, senha) {
    try {
        const resposta = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });

        const dados = await resposta.json();
        console.log('Resposta do login:', dados); // Debug
        
        localStorage.setItem('authToken', dados.authToken);
        localStorage.setItem('lojasPermitidas', dados.lojas_permitidas);
        console.log('Dados armazenados:', { // Debug
            token: dados.authToken,
            lojasPermitidas: dados.lojas_permitidas
        });

        window.location.href = 'pedidoloja.html';
    } catch (erro) {
        console.error('Erro no login:', erro); // Debug
        mostrarErro('Login falhou: ' + erro.message);
    }
}

// Modificação na função carregarLojaAutomaticamente
async function carregarLojaAutomaticamente() {
    try {
        const lojasPermitidas = localStorage.getItem('lojasPermitidas');
        console.log('Lojas permitidas:', lojasPermitidas);

        if (lojasPermitidas === '0') {
            await carregarLojas();
            elementos.seletorLoja.style.display = 'block';
        } else {
            const resposta = await fetch(`${API_URL}/lojas?loja_id=${lojasPermitidas}`);
            if (!resposta.ok) throw new Error(`HTTP ${resposta.status} - ${resposta.statusText}`);
            
            const loja = await resposta.json();
            preencherSelectLojas([loja]);
            elementos.seletorLoja.style.display = 'none';
            await carregarPedidos(lojasPermitidas);
        }
    } catch (erro) {
        console.error('Erro no carregamento:', erro);
        mostrarErro(`Falha ao carregar dados: ${erro.message}`);
    }
}


function verificarAcesso() {
    const lojasPermitidas = localStorage.getItem('lojasPermitidas');
    const token = localStorage.getItem('authToken');

    if (!token || !lojasPermitidas) {
        mostrarErro('Acesso não autorizado');
        setTimeout(() => window.location.href = 'index.html', 2000);
        throw new Error('Redirecionando para login');
    }
    console.log('Acesso permitido para loja:', lojasPermitidas);
}

// Função modificada para preencher selects
function preencherSelectLojas(lojas) {
    const options = lojas.map(loja => 
        `<option value="${loja.id}">${loja.loja_nome}</option>`
    ).join('');
    
    [elementos.seletorLoja, elementos.seletorLojaImportacao].forEach(select => {
        select.innerHTML = '<option value="">Selecione uma loja</option>' + options;
    });
}

const elementos = {
    seletorLoja: document.getElementById('seletorLoja'),
    seletorLojaImportacao: document.getElementById('seletorLojaImportacao'),
    seletorPedido: document.getElementById('seletorPedido'),
    selectPedido: document.getElementById('selectPedido'),
    listaPedidos: document.getElementById('listaPedidos'),
    error: document.getElementById('error'),
    loading: document.getElementById('loading'),
    resultadoImportacao: document.getElementById('resultadoImportacao')
};
// Verificação de elementos críticos
const elementosCriticos = ['listaPedidos', 'seletorLoja', 'seletorPedido', 'resultadoImportacao'];
elementosCriticos.forEach(id => {
    if (!document.getElementById(id)) {
        console.error(`Elemento #${id} não encontrado!`);
    }
}); 
function agruparProdutos() {
    console.log('Iniciando agrupamento...'); // Debug 1
    
    if (!currentSkus || currentSkus.length === 0) {
        console.error('Nenhum dado disponível para agrupamento');
        return {};
    }

    const agrupados = {};
    const numerações = new Set();

    currentSkus.forEach(sku => {
        // Debug: Verifique cada SKU
        console.log('Processando SKU:', sku); // Debug 2
        
        const baseId = sku._produtos?.produto_base_id;
        const numeracao = sku._produtos?.numeracao || 'N/A';
        const nomeBase = sku._produtos?.nome_base || 'Nome não disponível'; // <-- Nova linha

        if (!baseId || baseId === 0) {
            console.warn('SKU sem base_id válido:', sku.id);
            return;
        }

        if (!agrupados[baseId]) {
            agrupados[baseId] = {
                base_id: baseId,
                 nome_base: nomeBase,
                variacoes: {}
                
            };
        }

        agrupados[baseId].variacoes[numeracao] = {
            id: sku.id,
            codigo: sku._produtos.codigo_externo,
            pedido: sku.pedido_quantidade || 0,
            entregue: sku.pedido_quantidade_entregue || 0,
            saldo: (sku.pedido_quantidade || 0) - (sku.pedido_quantidade_entregue || 0)
        };

        numerações.add(numeracao);
    });

    console.log('Agrupamento finalizado:', agrupados); // Debug 3
    return {
        agrupados,
        numerações: [...numerações].sort((a, b) => {
            if (a === 'N/A') return 1;
            if (b === 'N/A') return -1;
            return a - b;
        })
    };
}

function atualizarTabelas() {
    console.log('Atualizando tabela...');
    
    if (!currentSkus || currentSkus.length === 0) {
        console.error('Nenhum dado disponível para exibir');
        return;
    }

    const produtosAgrupados = {};
    const todasNumeracoes = new Set();

    currentSkus.forEach(sku => {
        const baseInfo = sku._produtos;
        const baseId = baseInfo?.produto_base_id;
        const numeracao = baseInfo?.numeracao || 'N/A';
        const nomeBase = baseInfo?.nome_base || 'Produto sem nome';

        if (!baseId || baseId === 0) return;

        if (!produtosAgrupados[baseId]) {
            produtosAgrupados[baseId] = {
                base_id: baseId,
                nome_base: nomeBase,
                variacoes: {}
            };
        }

        // Apenas quantidade entregue
        produtosAgrupados[baseId].variacoes[numeracao] = {
            codigo: baseInfo.codigo_externo,
            entregue: sku.pedido_quantidade || 0
        };

        todasNumeracoes.add(numeracao);
    });

    const numeracoesOrdenadas = [...todasNumeracoes].sort((a, b) => {
        if (a === 'N/A') return 1;
        if (b === 'N/A') return -1;
        return a - b;
    });

    // Atualizar única tabela
    const header = document.getElementById('headerEntregue');
    const body = document.getElementById('bodyEntregue');

    header.innerHTML = `
        <tr>
            <th class="base-header">Produto</th>
            ${numeracoesOrdenadas.map(n => `<th>${n}</th>`).join('')}
        </tr>
    `;

    body.innerHTML = '';
    
    Object.values(produtosAgrupados).forEach(produto => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="base-header" title="ID: ${produto.base_id}">
                ${produto.nome_base}
            </td>
            ${numeracoesOrdenadas.map(n => {
                const variacao = produto.variacoes[n];
                return `<td title="${variacao?.codigo || ''}">${variacao?.entregue || 0}</td>`;
            }).join('')}
        `;
        body.appendChild(row);
    });
}

async function carregarLojas() {
    try {
        console.log('Iniciando carregamento de todas as lojas...');
        const resposta = await fetch(`${API_URL}/lojas`);
        console.log('Resposta completa (/lojas):', resposta);
        
        const lojas = await resposta.json();
        console.log('Lista completa de lojas:', lojas);
        
        preencherSelectLojas(lojas);
        
    } catch (erro) {
        console.error('Erro ao carregar lojas:', erro);
        mostrarErro('Falha ao carregar lista completa de lojas');
    }
}

function formatarCNPJ(cnpj) {
    if (!cnpj) return 'CNPJ não informado';
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

async function carregarPedidos(lojaId) {
    // Verificar elementos antes de manipular
    const selectsPedido = [
        elementos.seletorPedido,
        elementos.selectPedido
    ].filter(select => select !== null);

    if (selectsPedido.length === 0) {
        mostrarErro('Elementos de seleção de pedido não encontrados!');
        return;
    }

    try {
        selectsPedido.forEach(select => {
            select.disabled = true;
            select.innerHTML = '<option value="">Carregando...</option>';
        });

        if (pedidosCache.has(lojaId)) {
            const data = pedidosCache.get(lojaId);
            atualizarSelectsPedido(data, selectsPedido);
            exibirListaPedidos(data);
            return;
        }

        const response = await fetch(`${API_URL}/pedidos_loja?loja_id=${lojaId}`);
        
        if (!response.ok) throw new Error(`Erro ${response.status}: ${response.statusText}`);
        
        const data = await response.json();
        
        if (!Array.isArray(data)) throw new Error('Resposta da API em formato inválido');

        const pedidosOrdenados = data.sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        );
        
        pedidosCache.set(lojaId, pedidosOrdenados);
        atualizarSelectsPedido(pedidosOrdenados, selectsPedido);
        exibirListaPedidos(pedidosOrdenados);

    } catch (erro) {
        mostrarErro(`Falha ao carregar pedidos: ${erro.message}`);
        console.error('Detalhes do erro:', erro);
    } finally {
        selectsPedido.forEach(select => {
            if (select) select.disabled = false;
        });
    }
}

function atualizarSelectsPedido(data, selects) {
    const options = data.map(pedido => 
        `<option value="${pedido.id}">
            ${pedido.pedido_nome} - ${new Date(pedido.created_at).toLocaleDateString()}
        </option>`
    ).join('');

    selects.forEach(select => {
        select.innerHTML = '<option value="">Selecione um pedido</option>' + options;
        select.disabled = false;
    });
}
async function processarXML() {
        try {
            // Verificar existência do elemento
            const resultado = elementos.resultadoImportacao;
            if (!resultado) {
                throw new Error('Elemento de resultado não foi encontrado no HTML');
            }
    
            const pedidoId = document.getElementById('selectPedido').value;
            const fileInput = document.getElementById('xmlInput');
    
            // Validações
            if (!pedidoId) throw new Error('Selecione um pedido antes de importar');
            if (!fileInput?.files?.[0]) throw new Error('Selecione um arquivo XML válido');

        const xmlString = await fileInput.files[0].text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        
        const ns = { nfe: 'http://www.portalfiscal.inf.br/nfe' };
        const produtos = [];
        
        Array.from(xmlDoc.getElementsByTagNameNS(ns.nfe, 'det')).forEach(det => {
            const prod = det.getElementsByTagNameNS(ns.nfe, 'prod')[0];
            if (prod) {
                const codigo = prod.getElementsByTagNameNS(ns.nfe, 'cProd')[0]?.textContent;
                const quantidade = parseFloat(prod.getElementsByTagNameNS(ns.nfe, 'qCom')[0]?.textContent);

                if (codigo && !isNaN(quantidade)) {
                    produtos.push({
                        codigo_externo: codigo.padStart(5, '0'),
                        quantidade_entregue: quantidade
                    });
                }
            }
        });

        if (produtos.length === 0) throw new Error('Nenhum produto válido encontrado no XML');

            const resposta = await fetch(`${API_URL}/atualizarquantidade_0`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pedidos_loja_id: Number(pedidoId),
                produtos_entregues: produtos
            })
        });

        if (!resposta.ok) {
            const erroData = await resposta.json();
            throw new Error(erroData.message || 'Erro na atualização');
        }

        resultado.className = 'upload-status success';
        resultado.innerHTML = `
            ✅ ${produtos.length} produtos atualizados<br>
            <small>ID Pedido: ${pedidoId}</small>
        `;

    } catch (erro) {
        if (elementos.resultadoImportacao) {
            elementos.resultadoImportacao.className = 'upload-status error';
            elementos.resultadoImportacao.textContent = `❌ Erro: ${erro.message}`;
        } else {
            alert(`ERRO CRÍTICO: ${erro.message}`); // Fallback
        }
        console.error(erro);
    }
}

async function carregarDetalhesPedido(pedidoId) {
    mostrarCarregamento(true);
    try {
        const [respostaPedido, respostaSkus] = await Promise.all([
            fetch(`${API_URL}/pedidos_loja/${pedidoId}`),
            fetch(`${API_URL}/pedidos_sku?pedido_loja_id=${pedidoId}`)
        ]);

        if (!respostaPedido.ok || !respostaSkus.ok) {
            throw new Error('Erro ao carregar detalhes');
        }

        const [pedido, skus] = await Promise.all([
            respostaPedido.json(),
            respostaSkus.json()
        ]);

        if (!pedido?._lojas?.loja_nome) {
            throw new Error("Dados da loja incompletos");
        }

        currentSkus = skus;
        numeracoes = [...new Set(
            skus.map(sku => parseInt(sku._produtos.numeracao))
                .filter(n => n >= 33)
        )].sort((a, b) => a - b);

        exibirDetalhesPedido(pedido);
        atualizarTabelas();
    } catch (erro) {
        console.error("Erro nos detalhes:", erro);
        mostrarErro(`Erro: ${erro.message}`);
    } finally {
        mostrarCarregamento(false);
    }
}

function exibirDetalhesPedido(pedido) {
    const container = document.getElementById('detalhesPedido');
    container.innerHTML = '';
    
    const detalhes = document.createElement('div');
    detalhes.innerHTML = `
        <p><strong>ID Pedido:</strong> ${pedido.id}</p>
        <p><strong>Loja:</strong> ${pedido._lojas.loja_nome}</p>
        <p><strong>CNPJ:</strong> ${pedido._lojas.loja_cnpj || 'Não informado'}</p>
        <p><strong>Data do Pedido:</strong> ${new Date(pedido.pedido_data).toLocaleDateString()}</p>
        <p><strong>Status:</strong> <span class="status-${pedido.status.toLowerCase()}">${pedido.status}</span></p>
        <p><strong>Última Atualização:</strong> ${new Date(pedido.updated_at).toLocaleString()}</p>
    `;

    container.appendChild(detalhes);
}

function exibirListaPedidos(pedidos) {
    const container = document.getElementById('listaPedidos');
    if (!container) {
        console.error('Container da lista de pedidos não encontrado');
        return;
    }

    container.innerHTML = '';

    pedidos.forEach(pedido => {
        const elemento = document.createElement('div');
        elemento.className = 'pedido-item';
        elemento.innerHTML = `
            <h3>${pedido.pedido_nome}</h3>
            <div class="pedido-info">
                <small>ID: ${pedido.id}</small>
                <small>${new Date(pedido.created_at).toLocaleDateString()}</small>
            </div>
            <div class="pedido-status status-${pedido.status.toLowerCase()}">
                <span class="status-indicator"></span>
                ${pedido.status}
            </div>
        `;

        elemento.addEventListener('click', () => {
            // Sincroniza todos os selects
            document.querySelectorAll('[id$="Pedido"]').forEach(select => {
                select.value = pedido.id;
            });
            carregarDetalhesPedido(pedido.id);
        });

        container.appendChild(elemento);
    });
}
function mostrarErro(mensagem) {
    const elemento = document.getElementById('error');
    
    // Mostrar alerta
    alert(`ERRO: ${mensagem}`);
    
    // Atualizar elemento de erro se existir
    if (elemento) {
        elemento.style.display = 'block';
        elemento.textContent = mensagem;
    }
    
    // Mantém o usuário na página para debug
    // window.location.href = 'index.html'; ← Removido
}

function mostrarCarregamento(mostrar) {
    const elemento = document.getElementById('loading');
    elemento.style.display = mostrar ? 'block' : 'none';
}
// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM carregado, elementos:', elementos);
    
    // Verificar elementos críticos
    const elementosCriticos = ['seletorLoja', 'seletorPedido', 'listaPedidos', 'error', 'loading'];
    elementosCriticos.forEach(id => {
        if (!elementos[id]) {
            const mensagem = `Elemento crítico #${id} não encontrado!`;
            alert(mensagem);
            throw new Error(mensagem); // Interrompe a execução
        }
    });
    
    elementosCriticos.forEach(id => {
        if (!elementos[id]) {
            console.error(`Elemento crítico não encontrado: ${id}`);
            mostrarErro(`Erro de configuração: Elemento ${id} não existe`);
        }
    });

    if(elementos.seletorLoja && elementos.seletorLojaImportacao) {
        carregarLojas();
    }
});

const lojaSelects = [elementos.seletorLoja, elementos.seletorLojaImportacao];
// Event Listeners
lojaSelects.forEach(select => {
    select.addEventListener('change', function() {
        if (this.value) {
            // Limpar cache ao mudar de loja
            pedidosCache.clear();
            currentSkus = [];
            numeracoes = [];
            
            // Atualizar interface
            document.querySelectorAll('[id$="Pedido"]').forEach(p => {
                p.innerHTML = '<option value="">Selecione um pedido</option>';
                p.disabled = false;
            });
            
            carregarPedidos(this.value);
        }
    });
});



// Adicione no final do código:
document.addEventListener('DOMContentLoaded', () => {
    if (elementos.seletorLoja.value) {
        elementos.seletorLoja.dispatchEvent(new Event('change'));
    }
});


