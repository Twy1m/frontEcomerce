const API_URL = 'http://localhost:3000'

const grid = document.querySelector('.grid-produtos')

const formatarPreco = (valor) =>
    Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function criarCard(produto) {
    const card = document.createElement('a')
    card.className = 'card-produto'
    card.dataset.id = produto.codProduto // vira data-id="..." no HTML
    card.href = `./produto.html?id=${produto.codProduto}`

    const cardImg = document.createElement('div')
    cardImg.className = 'card-img'

    const img = document.createElement('img')
    img.src = produto.imagem_principal
    img.alt = produto.nome
    img.loading = 'lazy'
    cardImg.appendChild(img)

    // a listagem não traz as imagens extras; se um dia trouxer, usa a primeira no hover
    const imgHover = produto.imagens?.[0]?.url_imagem
    if (imgHover) {
        const hover = document.createElement('img')
        hover.src = imgHover
        hover.alt = ''
        hover.className = 'img-hover'
        hover.loading = 'lazy'
        hover.setAttribute('aria-hidden', 'true')
        cardImg.appendChild(hover)
    }

    const content = document.createElement('div')
    content.className = 'card-content'

    const nome = document.createElement('h2')
    nome.className = 'card-name'
    nome.textContent = produto.nome

    const preco = document.createElement('span')
    preco.className = 'card-price'
    preco.textContent = formatarPreco(produto.preco)

    content.append(nome, preco)
    card.append(cardImg, content)
    return card
}

function mostrarMensagem(texto) {
    grid.innerHTML = ''
    const p = document.createElement('p')
    p.className = 'grid-mensagem'
    p.textContent = texto
    grid.appendChild(p)
}

async function carregarProdutos() {
    const headers = { 'Content-Type': 'application/json' }
    const token = localStorage.getItem('token')
    if (token) headers.authorization = `Bearer ${token}`

    // repassa filtros da URL pra API (ex.: produtos.html?categoria=1&ordenar=preco_asc)
    const query = window.location.search

    try {
        const resposta = await fetch(`${API_URL}/produtos${query}`, { headers })
        const dados = await resposta.json()

        if (!resposta.ok) {
            throw new Error(dados.message || 'Erro ao carregar produtos')
        }

        if (dados.length === 0) {
            mostrarMensagem('Nenhum produto encontrado.')
            return
        }

        grid.innerHTML = ''
        grid.append(...dados.map(criarCard))
    } catch (err) {
        console.error(err)
        mostrarMensagem('Não foi possível carregar os produtos. Tente novamente mais tarde.')
    }
}

carregarProdutos()
