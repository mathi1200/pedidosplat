const API_URL = 'https://x8ki-letl-twmt.n7.xano.io/api:4OHEwWeq';
let currentSkus = [];
let numeracoes = [];
let pedidosCache = new Map();

const elementos = {
    seletorLoja: document.getElementById('seletorLoja'),
    seletorLojaImportacao: document.getElementById('seletorLojaImportacao'),
    seletorPedido: document.getElementById('seletorPedido'),
    selectPedido: document.getElementById('selectPedido'),
    // ... outros elementos
};

async function carregarLojas() {
    try {
        // Verificar existência dos elementos
        if(!elementos.seletorLoja || !elementos.seletorLojaImportacao) {
            throw new Error('Elementos do seletor de loja não encontrados');
        }

        const resposta = await fetch(`${API_URL}/lojas`);
        if (!resposta.ok) throw new Error('Erro ao carregar lojas');
        
        const lojas = await resposta.json();

        // Template para options
        const optionsTemplate = lojas.map(loja => 
            `<option value="${loja.id}">
                ${loja.loja_nome} (${formatarCNPJ(loja.loja_cnpj)})
            </option>`
        ).join('');

        // Preencher selects
        [elementos.seletorLoja, elementos.seletorLojaImportacao].forEach(select => {
            select.innerHTML = '<option value="">Selecione uma loja</option>' + optionsTemplate;
        });

    } catch (erro) {
        console.error('Erro detalhado:', {
            mensagem: erro.message,
            stack: erro.stack,
            elementos
        });
        mostrarErro(`Falha crítica: ${erro.message}`);
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
        console.error('Erro no carregamento:', erro);
        mostrarErro(`Falha ao carregar pedidos: ${erro.message}`);
        selectsPedido.forEach(select => {
            select.innerHTML = '<option value="">Erro ao carregar</option>';
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
    const saldo = {};

    currentSkus.forEach(sku => {
        const baseId = sku._produtos.codigo_externo;
        const numeracao = parseInt(sku._produtos.numeracao);
        const pedido = sku.pedido_quantidade || 0;
        const entrega = sku.pedido_quantidade_entregue || 0;
        
        if (!saldo[baseId]) {
            saldo[baseId] = {};
        }
        
        saldo[baseId][numeracao] = pedido - entrega;
    });

    return saldo;
}

function atualizarTabelas() {
    const atualizarHeader = (headerId) => {
        document.getElementById(headerId).innerHTML = `
            <tr>
                <th class="base-header">Base ID</th>
                ${numeracoes.map(n => `<th>${n}</th>`).join('')}
            </tr>
        `;
    };

    ['headerPedida', 'headerEntregue', 'headerSaldo'].forEach(atualizarHeader);

    const grupos = currentSkus.reduce((acc, sku) => {
        const baseId = sku._produtos.codigo_externo;
        if (!acc[baseId]) {
            acc[baseId] = { pedida: {}, entregue: {} };
        }
        
        const num = parseInt(sku._produtos.numeracao);
        acc[baseId].pedida[num] = sku.pedido_quantidade;
        acc[baseId].entregue[num] = sku.pedido_quantidade_entregue;
        
        return acc;
    }, {});

    const preencherTabela = (tipo, bodyId) => {
        const tbody = document.getElementById(bodyId);
        tbody.innerHTML = '';

        Object.entries(grupos).forEach(([baseId, dados]) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="base-header">${baseId}</td>
                ${numeracoes.map(n => `
                    <td>${dados[tipo][n] || ''}</td>
                `).join('')}
            `;
            tbody.appendChild(row);
        });
    };

    preencherTabela('pedida', 'bodyPedida');
    preencherTabela('entregue', 'bodyEntregue');

    const saldo = calcularSaldo();
    const bodySaldo = document.getElementById('bodySaldo');
    bodySaldo.innerHTML = '';

    Object.entries(saldo).forEach(([baseId, valores]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="base-header">${baseId}</td>
            ${numeracoes.map(n => {
                const valor = valores[n] || 0;
                return `<td class="${valor < 0 ? 'saldo-negativo' : ''}">${valor}</td>`;
            }).join('')}
        `;
        bodySaldo.appendChild(row);
    });
}

function mostrarErro(mensagem) {
    const elemento = document.getElementById('error');
    if (elemento) {
        elemento.style.display = 'block';
        elemento.textContent = mensagem;
    }
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
// Event Listeners
const lojaSelects = document.querySelectorAll('[id^="seletorLoja"]');
lojaSelects.forEach(select => {
    select.addEventListener('change', function() {
        if (this.value) {
            carregarPedidos(this.value);
        } else {
            document.querySelectorAll('[id$="Pedido"]').forEach(pedidoSelect => {
                pedidoSelect.disabled = true;
            });
        }
    });
});

