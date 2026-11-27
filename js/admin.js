// Painel do administrador (primeira versão: resumo, últimos pedidos e estoque baixo).
//
// Proteção de acesso: o tipo salvo no localStorage NÃO é confiável (qualquer um edita).
// A página só aparece depois que o servidor confirma em GET /usuarios/me que é admin.
// E mesmo que alguém force a página a aparecer, os dados vêm de rotas com "somenteAdmin".
const API_URL = 'http://localhost:3000'
const ESTOQUE_BAIXO = 3

const irParaLogin = () => window.location.replace(`./login.html?voltar=${encodeURIComponent('admin.html')}`)

if (!localStorage.getItem('token')) irParaLogin()

const pagina = document.querySelector('.pagina-admin')
const carregando = document.querySelector('.admin-carregando')
const saudacao = document.querySelector('.admin-saudacao')
const expira = document.querySelector('.admin-expira')
const resumo = document.querySelector('.admin-resumo')
const listaPedidos = document.querySelector('.admin-pedidos')
const listaEstoque = document.querySelector('.admin-estoque')

const STATUS = { PENDENTE: 'Pendente', PAGO: 'Pago', ENVIADO: 'Enviado', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado' }

function criarElemento(tag, classe, texto) {
    const el = document.createElement(tag)
    if (classe) el.className = classe
    if (texto !== undefined) el.textContent = texto
    return el
}

const formatarPreco = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatarData = (iso) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function sair() {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    localStorage.removeItem('carrinho')
    window.location.href = './login.html'
}
document.querySelector('#btn-sair-admin').addEventListener('click', sair)

async function api(rota) {
    const resposta = await fetch(`${API_URL}${rota}`, {
        headers: { authorization: `Bearer ${localStorage.getItem('token')}` }
    })
    if (resposta.status === 401) {
        // token vencido (a sessão de admin dura 2 h)
        localStorage.removeItem('token')
        irParaLogin()
        throw new Error('Sessão expirada')
    }
    const dados = await resposta.json()
    if (!resposta.ok) {
        const erro = new Error(dados?.message || 'Algo deu errado')
        erro.status = resposta.status
        throw erro
    }
    return dados
}

// só para mostrar "sessão expira às 16:30": o conteúdo do JWT é público (base64);
// quem decide se o token vale é o servidor
function expiracaoDoToken() {
    try {
        const payload = JSON.parse(atob(localStorage.getItem('token').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        return payload.exp ? new Date(payload.exp * 1000) : null
    } catch {
        return null
    }
}

function mostrarExpiracao() {
    const quando = expiracaoDoToken()
    if (!quando) return
    const atualizar = () => {
        const minutos = Math.round((quando - Date.now()) / 60000)
        if (minutos <= 0) {
            expira.textContent = 'Sessão expirada'
            irParaLogin()
            return
        }
        const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        expira.textContent = `Sessão expira às ${hora} (${minutos} min)`
    }
    atualizar()
    setInterval(atualizar, 30000)
}

// ---------- seções ----------

function cartaoResumo(titulo, valor, detalhe) {
    const cartao = criarElemento('div', 'admin-cartao')
    cartao.append(criarElemento('span', 'admin-cartao-titulo', titulo), criarElemento('strong', 'admin-cartao-valor', valor))
    if (detalhe) cartao.appendChild(criarElemento('span', 'admin-cartao-detalhe', detalhe))
    return cartao
}

function renderizarResumo(pedidos, produtos) {
    resumo.innerHTML = ''
    const porStatus = (s) => pedidos.filter((p) => p.status === s)
    const pendentes = porStatus('PENDENTE')
    const aEnviar = porStatus('PAGO')
    const ativos = produtos.filter((p) => p.ativo)
    const semEstoque = ativos.filter((p) => p.estoque <= 0)
    const faturado = pedidos
        .filter((p) => ['PAGO', 'ENVIADO', 'ENTREGUE'].includes(p.status))
        .reduce((soma, p) => soma + Math.round(Number(p.valor_total) * 100), 0)

    resumo.append(
        cartaoResumo('Pedidos pendentes', String(pendentes.length), 'aguardando pagamento'),
        cartaoResumo('A enviar', String(aEnviar.length), 'pagos, ainda não enviados'),
        cartaoResumo('Produtos ativos', String(ativos.length), `${semEstoque.length} sem estoque`),
        cartaoResumo('Faturado', formatarPreco(faturado / 100), 'pedidos pagos, enviados e entregues')
    )
}

function renderizarPedidos(pedidos) {
    listaPedidos.innerHTML = ''
    if (!pedidos.length) {
        listaPedidos.appendChild(criarElemento('p', 'perfil-vazio', 'Nenhum pedido ainda.'))
        return
    }

    const envoltorio = criarElemento('div', 'admin-tabela-envoltorio')
    const tabela = criarElemento('table', 'admin-tabela')
    const cabecalho = criarElemento('tr')
    ;['Pedido', 'Cliente', 'Data', 'Status', 'Total'].forEach((t) => cabecalho.appendChild(criarElemento('th', '', t)))
    const thead = criarElemento('thead')
    thead.appendChild(cabecalho)
    const tbody = criarElemento('tbody')

    pedidos.slice(0, 10).forEach((p) => {
        const linha = criarElemento('tr')
        const status = criarElemento('span', `pedido-status status-${p.status.toLowerCase()}`, STATUS[p.status] || p.status)
        const celulaStatus = criarElemento('td')
        celulaStatus.appendChild(status)
        linha.append(
            criarElemento('td', '', `#${p.codPedido}`),
            criarElemento('td', '', p.usuario?.nome ?? '—'),
            criarElemento('td', '', formatarData(p.createdAt)),
            celulaStatus,
            criarElemento('td', 'admin-numero', formatarPreco(p.valor_total))
        )
        tbody.appendChild(linha)
    })

    tabela.append(thead, tbody)
    envoltorio.appendChild(tabela)
    listaPedidos.appendChild(envoltorio)
    if (pedidos.length > 10) {
        listaPedidos.appendChild(criarElemento('p', 'perfil-vazio', `Mostrando 10 de ${pedidos.length} pedidos.`))
    }
}

function renderizarEstoque(produtos) {
    listaEstoque.innerHTML = ''
    const baixos = produtos
        .filter((p) => p.ativo && p.estoque <= ESTOQUE_BAIXO)
        .sort((a, b) => a.estoque - b.estoque)

    if (!baixos.length) {
        listaEstoque.appendChild(criarElemento('p', 'perfil-vazio', `Nenhum produto com ${ESTOQUE_BAIXO} unidades ou menos.`))
        return
    }

    const lista = criarElemento('ul', 'admin-estoque-lista')
    baixos.forEach((p) => {
        const li = criarElemento('li', 'admin-estoque-item')
        const link = criarElemento('a', '', p.nome)
        link.href = `./produto.html?id=${p.codProduto}`
        li.append(link, criarElemento('span', p.estoque === 0 ? 'admin-estoque-zero' : 'admin-estoque-qtd', p.estoque === 0 ? 'Esgotado' : `${p.estoque} un.`))
        lista.appendChild(li)
    })
    listaEstoque.appendChild(lista)
}

// ---------- início ----------

async function iniciar() {
    let usuario
    try {
        usuario = await api('/usuarios/me')
    } catch (err) {
        if (err.message !== 'Sessão expirada') carregando.textContent = 'Não foi possível conferir o acesso. Tente de novo.'
        return
    }

    // logado, mas não é admin: não tem nada para ver aqui
    if (usuario.tipo !== 'admin') {
        window.location.replace('./perfil.html')
        return
    }

    carregando.hidden = true
    pagina.hidden = false
    saudacao.textContent = `Olá, ${usuario.nome}.`
    mostrarExpiracao()

    try {
        const [pedidos, produtos] = await Promise.all([api('/pedidos'), api('/produtos?inativos=true')])
        renderizarResumo(pedidos, produtos)
        renderizarPedidos(pedidos)
        renderizarEstoque(produtos)
    } catch (err) {
        if (err.message === 'Sessão expirada') return
        resumo.textContent = listaPedidos.textContent = listaEstoque.textContent = err.message
    }
}

if (localStorage.getItem('token')) iniciar()
