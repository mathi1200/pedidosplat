const API_URL = 'https://x8ki-letl-twmt.n7.xano.io/api:4OHEwWeq';
let currentSkus = [];
let numeracoes = [];
let pedidosCache = new Map();

document.addEventListener('DOMContentLoaded', () => {
    verificarAcesso();
    carregarLojaAutomaticamente();
});

async function carregarLojaAutomaticamente() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        const payload = JSON.parse(atob(token.split('.')[1]
            .replace(/-/g, '+')
            .replace(/_/g, '/')));

        const lojaId = payload.lojas_permitidas;

        if (lojaId === 0) {
            await carregarLojas();
            elementos.seletorLoja.style.display = 'block';
        } else {
            // Requisição SEM token no header
            const resposta = await fetch(`${API_URL}/lojas?loja_id=${lojaId}`);
            if (!resposta.ok) throw new Error('Loja não encontrada');
            
            const loja = await resposta.json();
            preencherSelectLojas([loja]);
            
            elementos.seletorLoja.value = lojaId;
            elementos.seletorLoja.style.display = 'none';
            await carregarPedidos(lojaId);
        }
    } catch (erro) {
        mostrarErro(`Erro ao carregar loja: ${erro.message}`);
        console.error(erro);
    }
}



function verificarAcesso() {
    const token = localStorage.getItem('authToken');

    if (!token) {
        window.location.href = 'index.html';
        return;
    }

    try {
        const partes = token.split('.');
        if (partes.length !== 3) {
            throw new Error('Token inválido');
        }

        function base64UrlDecode(str) {
            str = str.replace(/-/g, '+').replace(/_/g, '/');
            while (str.length % 4) {
                str += '=';
            }
            return atob(str);
        }

        const payload = JSON.parse(base64UrlDecode(partes[1]));

        if (!payload.lojas_permitidas) {
            mostrarErro('Token não tem permissões necessárias');
            localStorage.removeItem('authToken');
            return;
        }

    } catch (erro) {
        mostrarErro(`Erro na verificação do token: ${erro.message}`);
        localStorage.removeItem('authToken');
        return;
    }
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
    // ... outros elementos
};

// Verificação de elementos críticos
const elementosCriticos = ['listaPedidos', 'seletorLoja', 'seletorPedido'];
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
    console.log('Atualizando tabelas...');
    
    if (!currentSkus || currentSkus.length === 0) {
        console.error('Nenhum dado disponível para exibir');
        return;
    }

    // 1. Agrupar por produto_base_id mantendo o nome_base
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
                nome_base: nomeBase, // Adicionado o nome_base aqui
                variacoes: {}
            };
        }

        produtosAgrupados[baseId].variacoes[numeracao] = {
            id: sku.id,
            codigo: baseInfo.codigo_externo,
            pedido: sku.pedido_quantidade || 0,
            entregue: sku.pedido_quantidade_entregue || 0,
            saldo: (sku.pedido_quantidade || 0) - (sku.pedido_quantidade_entregue || 0)
        };

        todasNumeracoes.add(numeracao);
    });

    // 2. Ordenar numerações
    const numeracoesOrdenadas = [...todasNumeracoes].sort((a, b) => {
        if (a === 'N/A') return 1;
        if (b === 'N/A') return -1;
        return a - b;
    });

    // 3. Função para atualizar cada tabela
    const atualizarTabela = (tipo, headerId, bodyId) => {
        const header = document.getElementById(headerId);
        const body = document.getElementById(bodyId);
        
        if (!header || !body) {
            console.error(`Elementos da tabela ${headerId}/${bodyId} não encontrados`);
            return;
        }

        // Cabeçalho com nome do produto
        header.innerHTML = `
            <tr>
                <th class="base-header">Nome do Produto</th>
                ${numeracoesOrdenadas.map(n => `<th>${n}</th>`).join('')}
            </tr>
        `;

        body.innerHTML = '';
        
        // Preencher linhas com nome_base
        Object.values(produtosAgrupados).forEach(produto => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="base-header" title="ID: ${produto.base_id}">
                    ${produto.nome_base}
                </td>
                ${numeracoesOrdenadas.map(n => {
                    const variacao = produto.variacoes[n];
                    if (!variacao) return '<td></td>';
                    
                    const valor = tipo === 'saldo' ? variacao.saldo : 
                                 tipo === 'entregue' ? variacao.entregue : 
                                 variacao.pedido;
                    
                    const classe = tipo === 'saldo' && valor < 0 ? 'saldo-negativo' : '';
                    return `<td class="${classe}" title="${variacao.codigo}">${valor}</td>`;
                }).join('')}
            `;
            body.appendChild(row);
        });
    };

    // Atualizar todas as tabelas
    atualizarTabela('pedido', 'headerPedida', 'bodyPedida');
    atualizarTabela('entregue', 'headerEntregue', 'bodyEntregue');
    atualizarTabela('saldo', 'headerSaldo', 'bodySaldo');

    console.log('Tabelas atualizadas com sucesso');
}
async function carregarLojas() {
    try {
        const resposta = await fetch(`${API_URL}/lojas`);
        if (!resposta.ok) throw new Error('Erro ao carregar lojas');
        
        const lojas = await resposta.json();

        const optionsTemplate = lojas.map(loja => 
            `<option value="${loja.id}">
                ${loja.loja_nome} (${formatarCNPJ(loja.loja_cnpj)})
            </option>`
        ).join('');

        [elementos.seletorLoja, elementos.seletorLojaImportacao].forEach(select => {
            select.innerHTML = '<option value="">Selecione uma loja</option>' + optionsTemplate;
        });

    } catch (erro) {
        mostrarErro(`Falha ao carregar lojas: ${erro.message}`);
        console.error(erro);
    }
}

function formatarCNPJ(cnpj) {
    if (!cnpj) return 'CNPJ não informado';
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

async function carregarPedidos(lojaId) {
    const selectsPedido = [
        document.getElementById('seletorPedido'),
        document.getElementById('selectPedido')
    ];

    selectsPedido.forEach(select => {
        select.disabled = true;
        select.innerHTML = '<option value="">Carregando...</option>';
    });

    try {
        // Verificar cache primeiro
        if (pedidosCache.has(lojaId)) {
            const data = pedidosCache.get(lojaId);
            atualizarSelectsPedido(data, selectsPedido);
            exibirListaPedidos(data);
            return;
        }

        // Requisição GET com query parameter
        const response = await fetch(`${API_URL}/pedidos_loja?loja_id=${lojaId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Validar resposta
        if (!Array.isArray(data)) {
            throw new Error('Resposta da API em formato inválido');
        }

        // Ordenar por data decrescente e armazenar no cache
        const pedidosOrdenados = data.sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        );
        
        pedidosCache.set(lojaId, pedidosOrdenados);
        
        // Atualizar interface
        atualizarSelectsPedido(pedidosOrdenados, selectsPedido);
        exibirListaPedidos(pedidosOrdenados);

    } catch (erro) {
        mostrarErro(`Falha ao carregar pedidos: ${erro.message}`);
        console.error(erro);
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
        const pedidoId = document.getElementById('selectPedido').value;
        const fileInput = document.getElementById('xmlInput');
        const resultado = document.getElementById('resultadoImportacao');

        // Validações
        if (!pedidoId) throw new Error('Selecione um pedido');
        if (!fileInput.files[0]) throw new Error('Selecione um arquivo XML');

        // Processar XML
        const xmlString = await fileInput.files[0].text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        
        // Namespace da NFe
        const ns = { nfe: 'http://www.portalfiscal.inf.br/nfe' };
        
        // Extrair produtos
        const produtos = [];
        const dets = xmlDoc.getElementsByTagNameNS(ns.nfe, 'det');
        
        Array.from(dets).forEach(det => {
            const prod = det.getElementsByTagNameNS(ns.nfe, 'prod')[0];
            if (prod) {
                const codigo = prod.getElementsByTagNameNS(ns.nfe, 'cProd')[0]?.textContent;
                const quantidade = parseFloat(prod.getElementsByTagNameNS(ns.nfe, 'qCom')[0]?.textContent);

                if (codigo && !isNaN(quantidade)) {
                    produtos.push({
                        codigo_externo: codigo.padStart(5, '0'), // Mantém 5 dígitos
                        quantidade_entregue: quantidade
                    });
                }
            }
        });

        if (produtos.length === 0) {
            throw new Error('Nenhum produto válido encontrado no XML');
        }

        // Montar payload exato
        const payload = {
            pedidos_loja_id: Number(pedidoId),
            produtos_entregues: produtos
        };

        // Enviar para API
        const resposta = await fetch(`${API_URL}/atualizarquantidade`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        // Tratar resposta
        const respostaData = await resposta.json();
        
        if (!resposta.ok) {
            throw new Error(respostaData.message || 'Erro na atualização');
        }

        // Atualizar interface
        resultado.className = 'upload-status success';
        resultado.innerHTML = `
            ✅ ${produtos.length} produtos atualizados<br>
            <small>ID Pedido: ${pedidoId}</small>
        `;
        
        await carregarDetalhesPedido(pedidoId);

    } catch (erro) {
        resultado.className = 'upload-status error';
        resultado.textContent = `❌ Erro: ${erro.message}`;
        console.error('Erro detalhado:', erro);
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

function calcularSaldo() {
    return currentSkus.reduce((acc, sku) => {
        const baseId = sku._produtos.produto_base_id;
        const numeracao = sku._produtos.numeracao;
        
        if (!acc[baseId]) acc[baseId] = {};
        
        acc[baseId][numeracao] = (sku.pedido_quantidade || 0) - (sku.pedido_quantidade_entregue || 0);
        return acc;
    }, {});
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

function showTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('table').forEach(table => {
        table.classList.remove('active');
    });
    
    document.querySelector(`#tabela${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`)
        .classList.add('active');
    event.target.classList.add('active');
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM carregado, elementos:', elementos);
    
    // Verificar elementos críticos
    const elementosCriticos = [
        'seletorLoja', 
        'seletorLojaImportacao',
        'seletorPedido',
        'selectPedido'
    ];
    
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


