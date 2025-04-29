const API_URL = 'https://x8ki-letl-twmt.n7.xano.io/api:4OHEwWeq';
let currentSkus = [];
let numeracoes = [];
let pedidosCache = new Map();

currentSkus.forEach((sku, index) => {
    if (!sku._produtos?.produto_base_id) {
        console.error(`SKU inválido na posição ${index}:`, sku);
        mostrarErro(`Erro no produto ID ${sku.id} - Dados incompletos`);
    }
});

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
    const agrupados = {};

    currentSkus.forEach(sku => {
        const baseInfo = sku._produtos;
        const baseId = baseInfo?.produto_base_id;
        const numeracao = baseInfo?.numeracao || 'N/A';

        if (!baseId || baseId === 0) return;

        if (!agrupados[baseId]) {
            agrupados[baseId] = {
                base_id: baseId,
                nome_base: baseInfo.nome_base || 'Nome não disponível',
                variacoes: {}
            };
        }

        agrupados[baseId].variacoes[numeracao] = {
            codigo: baseInfo.codigo_externo,
            quantidade: sku.pedido_quantidade || 0
        };
    });

    return agrupados;
}

function atualizarTabelas() {
    const produtosAgrupados = {};
    const todasNumeracoes = new Set();

    // Passo 1: Normalização e consolidação dos dados
    currentSkus.forEach(sku => {
        const baseInfo = sku._produtos;
        const baseId = baseInfo?.produto_base_id;
        
        // Normalização crítica ↓
        const numeracao = (baseInfo?.numeracao?.toString() || 'N/A')
            .trim() // Remove espaços extras
            .replace(/[^0-9]/g, ''); // Remove caracteres não numéricos

        if (!baseId) {
            console.warn('SKU ignorado (sem produto_base_id):', sku);
            return;
        }

        // Inicialização do grupo
        if (!produtosAgrupados[baseId]) {
            produtosAgrupados[baseId] = {
                base_id: baseId,
                nome_base: baseInfo.nome_base?.replace(/�/g, 'Ç') || 'Produto desconhecido', // Corrige caracteres
                variacoes: {},
                totalGeral: 0
            };
        }

        const grupo = produtosAgrupados[baseId];
        const quantidade = Math.max(Number(sku.pedido_quantidade) || 0, 0); // Força número positivo

        // Consolidação ↓
        grupo.variacoes[numeracao] = (grupo.variacoes[numeracao] || 0) + quantidade;
        grupo.totalGeral += quantidade;
        todasNumeracoes.add(numeracao);
    });

    // Passo 2: Ordenação numérica robusta
    const numeracoesOrdenadas = [...todasNumeracoes].sort((a, b) => {
        const numA = parseInt(a, 10) || 9999; // 'N/A' vai para o final
        const numB = parseInt(b, 10) || 9999;
        return numA - numB;
    });

    // Passo 3: Renderização da tabela
    const header = document.getElementById('headerEntregue');
    const body = document.getElementById('bodyEntregue');

    header.innerHTML = `
        <tr>
            <th>Produto</th>
            ${numeracoesOrdenadas.map(n => `<th>${n}</th>`).join('')}
            <th>Total</th>
        </tr>
    `;

    body.innerHTML = Object.values(produtosAgrupados).map(grupo => `
        <tr>
            <td>${grupo.nome_base} (ID: ${grupo.base_id})</td>
            ${numeracoesOrdenadas.map(n => `<td>${grupo.variacoes[n] || 0}</td>`).join('')}
            <td class="total">${grupo.totalGeral}</td>
        </tr>
    `).join('');
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
        const resultado = elementos.resultadoImportacao;
        if (!resultado) throw new Error('Elemento de resultado não encontrado');

        const pedidoId = document.getElementById('selectPedido').value;
        const fileInput = document.getElementById('xmlInput');
        
        // Validações
        if (!pedidoId) throw new Error('Selecione um pedido antes de importar');
        if (!fileInput?.files?.[0]) throw new Error('Selecione um arquivo XML válido');

        // Obter dados do pedido para pegar a razão social
        const respostaPedido = await fetch(`${API_URL}/pedidos_loja/${pedidoId}`);
        if (!respostaPedido.ok) throw new Error('Erro ao buscar dados do pedido');
        const pedidoData = await respostaPedido.json();
        
        // Extrair razão social da loja receptora
        const razaoSocial = pedidoData?._lojas?.loja_razao_social || 'Loja não identificada';
        
        // 1. Obter produtos existentes do pedido
        const produtosExistentes = await obterProdutosDoPedido(pedidoId);
        
        // 2. Processar XML
        const { nfData, produtos: produtosXML } = await extrairProdutosXML(fileInput.files[0]);
        
        // 3. Combinar dados
        const produtosAtualizados = combinarQuantidades(produtosExistentes, produtosXML);

        // 4. Enviar para API
        const resposta = await atualizarProdutosNaAPI(pedidoId, produtosAtualizados, nfData);

        // 5. Atualizar UI com razão social
        resultado.className = 'upload-status success';
        resultado.innerHTML = `
            ✅ ${produtosAtualizados.length} produtos processados<br>
            NF: Série ${nfData.serie}, Número ${nfData.numero}<br>
            Loja receptora: ${razaoSocial}
        `;
        
        // 6. Recarregar dados
        await carregarDetalhesPedido(pedidoId);

    } catch (erro) {
        console.error('Erro no processamento:', erro);
        elementos.resultadoImportacao.className = 'upload-status error';
        elementos.resultadoImportacao.textContent = `❌ Erro: ${erro.message}`;
    }
}
async function buscarEntradasNotas(pedidoId) {
    try {
      const url = new URL(`${API_URL}/entrada`);
      url.searchParams.append('pedido_loja_id', pedidoId);
  
      const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
  
      const data = await response.json();
      console.log('RAW entradas vindas da API:', data);
  
      const entries = Array.isArray(data) ? data : (data.data || []);
      console.log('entries após normalização de array:', entries);
  
      // REMOVE filter por pedido_loja_id — the API já fez isso pra você
      return entries.filter(entry =>
        entry.nf_serie   || 
        entry.nf_numero  || 
        entry.entrada_data
      );
    } catch (erro) {
      console.error('Erro na busca de entradas:', erro);
      mostrarErro(`Falha ao carregar entradas: ${erro.message}`);
      return [];
    }
  }
// Funções auxiliares
async function obterProdutosDoPedido(pedidoId) {
    const response = await fetch(`${API_URL}/pedidos_sku?pedido_loja_id=${pedidoId}`);
    if (!response.ok) throw new Error('Falha ao buscar produtos existentes');
    return await response.json();
}

async function extrairProdutosXML(arquivoXML) {
    const xmlString = await arquivoXML.text();
    const xmlDoc = new DOMParser().parseFromString(xmlString, "text/xml");
    const ns = { nfe: 'http://www.portalfiscal.inf.br/nfe' };

    // Extrair dados da NF
    const ide = xmlDoc.getElementsByTagNameNS(ns.nfe, 'ide')[0];
    const emit = xmlDoc.getElementsByTagNameNS(ns.nfe, 'emit')[0];

    const nfData = {
        serie: ide.getElementsByTagNameNS(ns.nfe, 'serie')[0]?.textContent || '',
        numero: ide.getElementsByTagNameNS(ns.nfe, 'nNF')[0]?.textContent || '',
        cnpj_emitente: emit.getElementsByTagNameNS(ns.nfe, 'CNPJ')[0]?.textContent || ''
    };

    // Extrair produtos
    const produtos = Array.from(xmlDoc.getElementsByTagNameNS(ns.nfe, 'det')).map(det => {
        const prod = det.getElementsByTagNameNS(ns.nfe, 'prod')[0];
        return {
            codigo_externo: prod.getElementsByTagNameNS(ns.nfe, 'cProd')[0].textContent.padStart(5, '0'),
            quantidade: parseFloat(prod.getElementsByTagNameNS(ns.nfe, 'qCom')[0].textContent)
        };
    }).filter(p => p.codigo_externo && !isNaN(p.quantidade));

    return { nfData, produtos };
}

function combinarQuantidades(existentes, novos) {
    const mapaProdutos = new Map();

    novos.forEach(prod => {
        try {
            const codigo = prod.codigo_externo?.padStart(5, '0') || 'N/A';
            const quantidade = Number(prod.quantidade) || 0;
            
            if (codigo !== 'N/A' && !isNaN(quantidade)) {
                mapaProdutos.set(codigo, {
                    codigo_externo: codigo,
                    quantidade: quantidade // Substitui a soma pela atribuição direta
                });
            }
        } catch (e) {
            console.warn('Produto inválido ignorado:', prod);
        }
    });

    // Mantém os existentes que não foram substituídos
    existentes.forEach(prod => {
        const codigoRaw = prod._produtos?.codigo_externo;
        const codigo = codigoRaw ? codigoRaw.padStart(5, '0') : 'N/A';
        if (codigo !== 'N/A' && !mapaProdutos.has(codigo)) {
            mapaProdutos.set(codigo, {
                codigo_externo: codigo,
                quantidade: prod.pedido_quantidade || 0
            });
        }
    });

    return Array.from(mapaProdutos.values());
}

async function atualizarProdutosNaAPI(pedidoId, produtos, nfData) {
    const response = await fetch(`${API_URL}/atualizarquantidade_0`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pedidos_loja_id: Number(pedidoId),
            produtos_entregues: produtos.map(p => ({
                codigo_externo: p.codigo_externo,
                quantidade_entregue: p.quantidade
            })),
            nf_serie: nfData.serie,
            nf_numero: nfData.numero,
            nf_loja: nfData.cnpj_emitente
        })
    });

    if (!response.ok) {
        const erroData = await response.json();
        throw new Error(erroData.message || 'Erro na atualização');
    }
    return response.json();
}

async function carregarDetalhesPedido(pedidoId) {
    mostrarCarregamento(true);
    try {
        const [pedidoResponse, skusResponse] = await Promise.all([
            fetch(`${API_URL}/pedidos_loja/${pedidoId}`),
            fetch(`${API_URL}/pedidos_sku?pedido_loja_id=${pedidoId}`)
        ]);

        if (!pedidoResponse.ok || !skusResponse.ok) {
            throw new Error('Erro ao carregar dados do pedido');
        }

        const pedido = await pedidoResponse.json();
        const skus = await skusResponse.json();

        currentSkus = skus.filter(sku => sku._produtos?.produto_base_id);
        numeracoes = [...new Set(
            currentSkus.map(sku => parseInt(sku._produtos.numeracao)))
        ].sort((a, b) => a - b);

        await exibirDetalhesPedido(pedido);
        atualizarTabelas();

    } catch (erro) {
        console.error("Erro ao carregar detalhes:", erro);
        mostrarErro(`Falha ao carregar dados: ${erro.message}`);
    } finally {
        mostrarCarregamento(false);
    }
}

async function exibirDetalhesPedido(pedido) {
    const container = document.getElementById('detalhesPedido');
    console.log('exibirDetalhesPedido encontrou container?', container);
    if (!container) {
      console.error('Container de detalhes não encontrado!');
      return;
    }
    try {
        const entradas = await buscarEntradasNotas(pedido.id);
  console.log('Entradas retornadas de API:', entradas);
  const html = `
    <div class="pedido-info">
      <h2>${pedido.pedido_nome}</h2>
      <p>ID: ${pedido.id}</p>
      <p>Status: <span class="status">${pedido.status}</span></p>
    </div>
    ${gerarTabelaEntradas(entradas)}
  `;
  console.log('HTML gerado para detalhes:', html);
  container.innerHTML = html;
} catch (erro) {
        console.error('Erro ao exibir detalhes:', erro);
        container.innerHTML = `<div class="error">Erro ao carregar detalhes: ${erro.message}</div>`;
    }
}


function gerarTabelaEntradas(entradas) {
    console.log('gerarTabelaEntradas recebeu:', entradas);
    if (!entradas?.length) {
      console.log('Nenhuma entrada para mostrar');
      return '<div class="sem-entradas">Nenhuma entrada registrada</div>';
    }

    // Converter datas corretamente
    const formatarData = (dataString) => {
        try {
            return new Date(dataString).toLocaleDateString('pt-BR');
        } catch {
            return 'Data inválida';
        }
    };

    return `
        <div class="entradas-section">
            <h3>Histórico de Entradas (${entradas.length})</h3>
            <table class="entradas-table">
                <thead>
                    <tr>
                        <th>Série</th>
                        <th>Número</th>
                        <th>Fornecedor</th>
                        <th>Data</th>
                    </tr>
                </thead>
                <tbody>
                    ${entradas.map(entrada => `
                        <tr>
                            <td>${entrada.nf_serie || '-'}</td>
                            <td>${entrada.nf_numero || '-'}</td>
                            <td>${formatarCNPJ(entrada.nf_loja) || '-'}</td>
                            <td>${formatarData(entrada.entrada_data)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
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



