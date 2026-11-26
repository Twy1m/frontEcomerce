// Página de produtos com filtros. A URL é a fonte da verdade:
// produtos.html?categoria=2&precoMax=3000&emEstoque=true&ordenar=preco_asc
// Assim o link pode ser compartilhado e o "voltar" do navegador desfaz o último filtro.
const API_URL = 'http://localhost:3000'

const FILTROS = ['categoria', 'busca', 'precoMin', 'precoMax', 'promocao', 'emEstoque', 'ordenar']

const ORDENACOES = [
    ['recentes', 'Mais recentes'],
    ['mais_vistos', 'Mais vistos'],
    ['preco_asc', 'Menor preço'],
    ['preco_desc', 'Maior preço'],
    ['nome_asc', 'Nome (A–Z)'],
    ['nome_desc', 'Nome (Z–A)']
]

const grid = document.querySelector('.grid-produtos')
const painel = document.querySelector('.filtros')
const titulo = document.querySelector('.produtos-titulo')
const contagem = document.querySelector('.produtos-contagem')
const chips = document.querySelector('.produtos-chips')
const selectOrdenar = document.querySelector('#ordenar')
const btnAbrirFiltros = document.querySelector('.btn-abrir-filtros')

const formatarPreco = (valor) =>
    Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })

function criarElemento(tag, classe, texto) {
    const el = document.createElement(tag)
    if (classe) el.className = classe
    if (texto !== undefined) el.textContent = texto
    return el
}

// ---------- estado na URL ----------

function lerURL() {
    const params = new URLSearchParams(window.location.search)
    const estado = {}
    FILTROS.forEach((f) => {
        const v = params.get(f)?.trim()
        if (v) estado[f] = v
    })
    if (estado.ordenar === 'recentes') delete estado.ordenar
    return estado
}

function montarQuery(estado) {
    const params = new URLSearchParams()
    FILTROS.forEach((f) => {
        if (estado[f] !== undefined && estado[f] !== null && estado[f] !== '') params.set(f, estado[f])
    })
    return params.toString()
}

// mudancas: { filtro: valor } (null apaga). limparOutros: começa do zero, mantendo só a ordenação.
function aplicar(mudancas, { limparOutros = false } = {}) {
    const atual = lerURL()
    const novo = limparOutros ? { ordenar: atual.ordenar, ...mudancas } : { ...atual, ...mudancas }
    Object.keys(novo).forEach((k) => {
        if (novo[k] === null || novo[k] === '' || novo[k] === false || novo[k] === undefined) delete novo[k]
    })
    if (novo.ordenar === 'recentes') delete novo.ordenar

    const query = montarQuery(novo)
    if (query === montarQuery(atual)) return // nada mudou
    history.pushState(null, '', query ? `?${query}` : window.location.pathname)
    carregar()
}

window.addEventListener('popstate', carregar)

// a navbar usa isso para trocar categoria/busca sem recarregar a página
window.filtrosProdutos = { aplicar }

// ---------- painel de filtros ----------

let categorias = []
const nomeCategoria = (id) => categorias.find((c) => String(c.codCategoria) === String(id))?.nome

const formFiltros = criarElemento('form', 'filtros-form')
formFiltros.noValidate = true

const topoPainel = criarElemento('div', 'filtros-topo')
const btnFecharFiltros = criarElemento('button', 'filtros-fechar', 'Ver produtos')
btnFecharFiltros.type = 'button'
topoPainel.append(criarElemento('h2', 'filtros-titulo', 'Filtros'), btnFecharFiltros)

function grupo(legenda) {
    const fs = criarElemento('fieldset', 'filtros-grupo')
    fs.appendChild(criarElemento('legend', '', legenda))
    return fs
}

// categoria
const grupoCategoria = grupo('Categoria')
const listaCategorias = criarElemento('div', 'filtros-opcoes')
grupoCategoria.appendChild(listaCategorias)

function opcaoRadio(texto, valor) {
    const label = criarElemento('label', 'filtros-opcao')
    const radio = criarElemento('input')
    radio.type = 'radio'
    radio.name = 'categoria'
    radio.value = valor
    radio.addEventListener('change', () => aplicar({ categoria: valor || null }))
    label.append(radio, document.createTextNode(texto))
    return label
}

// preço
const grupoPreco = grupo('Preço')
const linhaPreco = criarElemento('div', 'filtros-preco')
function campoPreco(nome, rotulo) {
    const label = criarElemento('label', 'filtros-preco-campo')
    label.appendChild(criarElemento('span', '', rotulo))
    const input = criarElemento('input')
    input.type = 'number'
    input.name = nome
    input.min = '0'
    input.step = '1'
    input.inputMode = 'decimal'
    input.placeholder = 'R$'
    label.appendChild(input)
    return label
}
linhaPreco.append(campoPreco('precoMin', 'Mínimo'), criarElemento('span', 'filtros-preco-traco', '–'), campoPreco('precoMax', 'Máximo'))
const btnAplicarPreco = criarElemento('button', 'btn-secundario', 'Aplicar')
btnAplicarPreco.type = 'submit'
const avisoPreco = criarElemento('p', 'filtros-aviso')
avisoPreco.setAttribute('role', 'alert')
avisoPreco.hidden = true
grupoPreco.append(linhaPreco, avisoPreco, btnAplicarPreco)

// disponibilidade
const grupoMais = grupo('Mostrar só')
function opcaoCheck(texto, nome) {
    const label = criarElemento('label', 'filtros-opcao')
    const check = criarElemento('input')
    check.type = 'checkbox'
    check.name = nome
    check.addEventListener('change', () => aplicar({ [nome]: check.checked ? 'true' : null }))
    label.append(check, document.createTextNode(texto))
    return label
}
grupoMais.append(opcaoCheck('Em promoção', 'promocao'), opcaoCheck('Com estoque', 'emEstoque'))

const btnLimpar = criarElemento('button', 'btn-link', 'Limpar filtros')
btnLimpar.type = 'button'
btnLimpar.addEventListener('click', () => aplicar({}, { limparOutros: true }))

formFiltros.append(grupoCategoria, grupoPreco, grupoMais, btnLimpar)
painel.append(topoPainel, formFiltros)

// Enter num campo de preço ou o botão "Aplicar"
formFiltros.addEventListener('submit', (e) => {
    e.preventDefault()
    avisoPreco.hidden = true
    const minTexto = formFiltros.elements.precoMin.value.trim()
    const maxTexto = formFiltros.elements.precoMax.value.trim()
    const min = minTexto === '' ? null : Number(minTexto)
    const max = maxTexto === '' ? null : Number(maxTexto)

    // conferido aqui para não gastar uma requisição com um pedido que o backend recusaria
    if ((min !== null && (Number.isNaN(min) || min < 0)) || (max !== null && (Number.isNaN(max) || max < 0))) {
        avisoPreco.textContent = 'Use valores a partir de zero.'
        avisoPreco.hidden = false
        return
    }
    if (min !== null && max !== null && min > max) {
        avisoPreco.textContent = 'O mínimo não pode ser maior que o máximo.'
        avisoPreco.hidden = false
        return
    }
    aplicar({ precoMin: min === null ? null : String(min), precoMax: max === null ? null : String(max) })
})

// ordenação
ORDENACOES.forEach(([valor, texto]) => selectOrdenar.appendChild(new Option(texto, valor)))
selectOrdenar.addEventListener('change', () => aplicar({ ordenar: selectOrdenar.value }))

// celular: o painel abre por cima da lista
function abrirPainel(abrir) {
    painel.classList.toggle('aberto', abrir)
    btnAbrirFiltros.setAttribute('aria-expanded', String(abrir))
    document.body.classList.toggle('filtros-abertos', abrir)
    if (abrir) btnFecharFiltros.focus()
}
btnAbrirFiltros.addEventListener('click', () => abrirPainel(true))
btnFecharFiltros.addEventListener('click', () => {
    abrirPainel(false)
    btnAbrirFiltros.focus()
})
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && painel.classList.contains('aberto')) abrirPainel(false)
})

// deixa o painel igual à URL
function sincronizarPainel(estado) {
    formFiltros.querySelectorAll('input[name="categoria"]').forEach((r) => {
        r.checked = r.value === (estado.categoria ?? '')
    })
    formFiltros.elements.precoMin.value = estado.precoMin ?? ''
    formFiltros.elements.precoMax.value = estado.precoMax ?? ''
    formFiltros.elements.promocao.checked = estado.promocao === 'true'
    formFiltros.elements.emEstoque.checked = estado.emEstoque === 'true'
    selectOrdenar.value = estado.ordenar ?? 'recentes'
    avisoPreco.hidden = true
}

// ---------- cabeçalho da lista: título, contagem e filtros ativos ----------

function textoPreco(estado) {
    const min = estado.precoMin !== undefined ? formatarPreco(estado.precoMin) : null
    const max = estado.precoMax !== undefined ? formatarPreco(estado.precoMax) : null
    if (min && max) return `${min} – ${max}`
    if (min) return `A partir de ${min}`
    return `Até ${max}`
}

function renderizarChips(estado) {
    chips.innerHTML = ''
    const ativos = []
    if (estado.busca) ativos.push([`"${estado.busca}"`, { busca: null }])
    if (estado.categoria) ativos.push([nomeCategoria(estado.categoria) ?? 'Categoria', { categoria: null }])
    if (estado.precoMin !== undefined || estado.precoMax !== undefined) {
        ativos.push([textoPreco(estado), { precoMin: null, precoMax: null }])
    }
    if (estado.promocao === 'true') ativos.push(['Em promoção', { promocao: null }])
    if (estado.emEstoque === 'true') ativos.push(['Com estoque', { emEstoque: null }])

    chips.hidden = !ativos.length
    ativos.forEach(([texto, remover]) => {
        const chip = criarElemento('button', 'chip')
        chip.type = 'button'
        chip.setAttribute('aria-label', `Remover filtro ${texto}`)
        chip.append(document.createTextNode(texto), criarElemento('span', 'chip-x', '×'))
        chip.addEventListener('click', () => aplicar(remover))
        chips.appendChild(chip)
    })
    if (ativos.length > 1) {
        const limpar = criarElemento('button', 'btn-link', 'Limpar tudo')
        limpar.type = 'button'
        limpar.addEventListener('click', () => aplicar({}, { limparOutros: true }))
        chips.appendChild(limpar)
    }

    // número de filtros no botão do celular
    const qtd = ativos.length
    btnAbrirFiltros.textContent = qtd ? `Filtros (${qtd})` : 'Filtros'
}

function renderizarTitulo(estado) {
    let texto = 'Todos os produtos'
    if (estado.busca) texto = `Resultados para "${estado.busca}"`
    else if (estado.categoria) texto = nomeCategoria(estado.categoria) ?? 'Produtos'
    titulo.textContent = texto
    document.title = `${texto} | E-comerce`
}

// ---------- cards ----------

function criarCard(produto) {
    const card = criarElemento('a', 'card-produto')
    card.dataset.id = produto.codProduto
    card.href = `./produto.html?id=${produto.codProduto}`

    const cardImg = criarElemento('div', 'card-img')
    const img = criarElemento('img')
    img.src = produto.imagem_principal
    img.alt = produto.nome
    img.loading = 'lazy'
    cardImg.appendChild(img)

    // a listagem não traz as imagens extras; se um dia trouxer, usa a primeira no hover
    const imgHover = produto.imagens?.[0]?.url_imagem
    if (imgHover) {
        const hover = criarElemento('img', 'img-hover')
        hover.src = imgHover
        hover.alt = ''
        hover.loading = 'lazy'
        hover.setAttribute('aria-hidden', 'true')
        cardImg.appendChild(hover)
    }

    // selos no canto da foto
    if (produto.estoque <= 0) cardImg.appendChild(criarElemento('span', 'card-selo esgotado', 'Esgotado'))
    else if (produto.promocao) cardImg.appendChild(criarElemento('span', 'card-selo', 'Promoção'))

    const content = criarElemento('div', 'card-content')
    if (produto.categoria) content.appendChild(criarElemento('span', 'card-categoria', produto.categoria.nome))
    content.append(
        criarElemento('h2', 'card-name', produto.nome),
        criarElemento('span', 'card-price', formatarPreco(produto.preco))
    )

    card.append(cardImg, content)
    return card
}

function mostrarMensagem(texto, { comLimpar = false } = {}) {
    grid.innerHTML = ''
    const caixa = criarElemento('div', 'grid-mensagem')
    caixa.appendChild(criarElemento('p', '', texto))
    if (comLimpar) {
        const btn = criarElemento('button', 'btn-secundario', 'Limpar filtros')
        btn.type = 'button'
        btn.addEventListener('click', () => aplicar({}, { limparOutros: true }))
        caixa.appendChild(btn)
    }
    grid.appendChild(caixa)
}

// ---------- carregar ----------

let controle = null

async function carregar() {
    const estado = lerURL()
    sincronizarPainel(estado)
    renderizarTitulo(estado)
    renderizarChips(estado)
    window.navbar?.marcar({ categoria: estado.categoria ?? null, busca: estado.busca ?? '' })

    // clicar rápido em vários filtros: só a última resposta vale
    controle?.abort()
    controle = new AbortController()

    grid.classList.add('carregando')
    contagem.textContent = 'Carregando...'

    const headers = {}
    const token = localStorage.getItem('token')
    if (token) headers.authorization = `Bearer ${token}`

    try {
        const query = montarQuery(estado)
        const resposta = await fetch(`${API_URL}/produtos${query ? `?${query}` : ''}`, { headers, signal: controle.signal })
        const dados = await resposta.json()

        if (!resposta.ok) {
            // ex.: link com filtro inválido (?precoMin=abc)
            contagem.textContent = ''
            mostrarMensagem(dados.message || 'Filtro inválido.', { comLimpar: true })
            return
        }

        contagem.textContent = dados.length === 1 ? '1 produto' : `${dados.length} produtos`

        if (dados.length === 0) {
            const temFiltro = Object.keys(estado).some((k) => k !== 'ordenar')
            mostrarMensagem('Nenhum produto encontrado com esses filtros.', { comLimpar: temFiltro })
            return
        }

        grid.innerHTML = ''
        grid.append(...dados.map(criarCard))
    } catch (err) {
        if (err.name === 'AbortError') return
        console.error(err)
        contagem.textContent = ''
        mostrarMensagem('Não foi possível carregar os produtos. Tente novamente mais tarde.')
    } finally {
        grid.classList.remove('carregando')
    }
}

// categorias vêm da navbar (com cache); sem elas, os produtos aparecem do mesmo jeito
async function iniciar() {
    try {
        categorias = await (window.navbar?.categorias() ?? Promise.resolve([]))
    } catch {
        categorias = []
    }
    listaCategorias.appendChild(opcaoRadio('Todas', ''))
    categorias.forEach((c) => listaCategorias.appendChild(opcaoRadio(c.nome, String(c.codCategoria))))
    carregar()
}

iniciar()
