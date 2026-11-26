const API_URL = 'http://localhost:3000'

const container = document.querySelector('.grid-produto')

const formatarPreco = (valor) =>
    Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function criarElemento(tag, classe, texto) {
    const el = document.createElement(tag)
    if (classe) el.className = classe
    if (texto !== undefined) el.textContent = texto
    return el
}

// fetch com o token do usuário; devolve o JSON ou lança erro com a mensagem do backend
async function api(rota, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' }
    const token = localStorage.getItem('token')
    if (token) headers.authorization = `Bearer ${token}`

    const resposta = await fetch(`${API_URL}${rota}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    })
    const dados = resposta.status === 204 ? null : await resposta.json()

    if (!resposta.ok) {
        // token vencido/inválido: limpa para o usuário entrar de novo
        if (resposta.status === 401) localStorage.removeItem('token')
        const erro = new Error(dados?.message || 'Algo deu errado')
        erro.status = resposta.status
        throw erro
    }
    return dados
}

const estaLogado = () => Boolean(localStorage.getItem('token'))

function mostrarMensagem(texto) {
    container.innerHTML = ''
    container.appendChild(criarElemento('p', 'produto-mensagem', texto))
}

// ---------- galeria: miniaturas na lateral + imagens grandes empilhadas ----------
function criarGaleria(urls, nomeProduto) {
    const galeria = criarElemento('div', 'produto-galeria')

    // imagens grandes, uma embaixo da outra
    const pilha = criarElemento('div', 'produto-imagens')
    const imagens = urls.map((url, i) => {
        const img = criarElemento('img', 'produto-imagem')
        img.src = url
        img.alt = i === 0 ? nomeProduto : `${nomeProduto} - foto ${i + 1}`
        if (i > 0) img.loading = 'lazy'
        pilha.appendChild(img)
        return img
    })

    // com uma imagem só não tem por que mostrar miniaturas
    if (urls.length < 2) {
        galeria.classList.add('sem-miniaturas')
        galeria.appendChild(pilha)
        return galeria
    }

    // carrossel do celular: setas nas laterais + contador "1 / 3"
    // (no computador as setas e o contador ficam escondidos pelo CSS)
    const palco = criarElemento('div', 'produto-palco')
    const anterior = criarElemento('button', 'palco-seta anterior', '‹')
    const proxima = criarElemento('button', 'palco-seta proxima', '›')
    anterior.type = proxima.type = 'button'
    anterior.setAttribute('aria-label', 'Foto anterior')
    proxima.setAttribute('aria-label', 'Próxima foto')
    const contador = criarElemento('span', 'palco-contador')

    // cada foto ocupa a largura inteira, então a posição da rolagem diz qual foto está na tela
    const indiceAtual = () => Math.round(pilha.scrollLeft / pilha.clientWidth) || 0
    const irPara = (i) => pilha.scrollTo({ left: i * pilha.clientWidth, behavior: 'smooth' })

    anterior.addEventListener('click', () => irPara(indiceAtual() - 1))
    proxima.addEventListener('click', () => irPara(indiceAtual() + 1))

    const atualizarPalco = () => {
        const i = indiceAtual()
        contador.textContent = `${i + 1} / ${urls.length}`
        anterior.disabled = i <= 0
        proxima.disabled = i >= urls.length - 1
    }
    pilha.addEventListener('scroll', atualizarPalco)
    window.addEventListener('resize', atualizarPalco)
    atualizarPalco()

    palco.append(pilha, anterior, proxima, contador)

    // mini carrossel vertical: seta ▲, lista de miniaturas que rola, seta ▼
    const carrossel = criarElemento('div', 'produto-carrossel')
    const setaCima = criarElemento('button', 'carrossel-seta', '▲')
    const setaBaixo = criarElemento('button', 'carrossel-seta', '▼')
    setaCima.type = setaBaixo.type = 'button'
    setaCima.setAttribute('aria-label', 'Miniaturas anteriores')
    setaBaixo.setAttribute('aria-label', 'Próximas miniaturas')

    const lista = criarElemento('div', 'produto-miniaturas')
    const miniaturas = urls.map((url, i) => {
        const botao = criarElemento('button', 'produto-miniatura')
        botao.type = 'button'
        botao.setAttribute('aria-label', `Ver foto ${i + 1}`)
        const img = criarElemento('img')
        img.src = url
        img.alt = ''
        img.loading = 'lazy'
        botao.appendChild(img)
        // clicar leva até a imagem grande correspondente
        botao.addEventListener('click', () => imagens[i].scrollIntoView({ behavior: 'smooth', block: 'start' }))
        lista.appendChild(botao)
        return botao
    })

    const passo = () => lista.clientHeight * 0.8
    setaCima.addEventListener('click', () => lista.scrollBy({ top: -passo(), behavior: 'smooth' }))
    setaBaixo.addEventListener('click', () => lista.scrollBy({ top: passo(), behavior: 'smooth' }))

    // desliga a seta quando já está no começo/fim da lista
    const atualizarSetas = () => {
        setaCima.disabled = lista.scrollTop <= 0
        setaBaixo.disabled = lista.scrollTop + lista.clientHeight >= lista.scrollHeight - 1
    }
    lista.addEventListener('scroll', atualizarSetas)
    window.addEventListener('resize', atualizarSetas)
    requestAnimationFrame(atualizarSetas)

    carrossel.append(setaCima, lista, setaBaixo)
    galeria.append(carrossel, palco)

    // marca a miniatura da imagem que está no meio da tela
    const marcarAtiva = (i) => {
        miniaturas.forEach((m, j) => m.classList.toggle('ativa', j === i))
        const m = miniaturas[i]
        // rola só a lista de miniaturas (scrollIntoView rolaria a página junto)
        lista.scrollTo({ top: m.offsetTop - lista.clientHeight / 2 + m.offsetHeight / 2, behavior: 'smooth' })
    }
    marcarAtiva(0)

    const observer = new IntersectionObserver(
        (entradas) => {
            entradas.forEach((e) => {
                if (e.isIntersecting) marcarAtiva(imagens.indexOf(e.target))
            })
        },
        { rootMargin: '-45% 0px -45% 0px' } // "meio da tela" = faixa de 10% no centro
    )
    imagens.forEach((img) => observer.observe(img))

    return galeria
}

// ---------- quantidade + adicionar ao carrinho + favoritar ----------
function criarAcoes(produto) {
    const acoes = criarElemento('div', 'produto-acoes')
    const aviso = criarElemento('p', 'produto-aviso')
    aviso.setAttribute('role', 'status')
    aviso.hidden = true

    const avisar = (texto, tipo = 'erro') => {
        aviso.textContent = texto
        aviso.className = `produto-aviso ${tipo}`
        aviso.hidden = false
    }

    const avisarLogin = () => {
        aviso.textContent = 'Entre na sua conta para continuar. '
        const link = criarElemento('a', '', 'Fazer login')
        // depois de entrar, o login traz o usuário de volta para este produto
        const voltar = `produto.html${window.location.search}`
        link.href = `./login.html?voltar=${encodeURIComponent(voltar)}`
        aviso.appendChild(link)
        aviso.className = 'produto-aviso erro'
        aviso.hidden = false
    }

    const tratarFalha = (err) => {
        if (err.status === 401) return avisarLogin()
        avisar(err.message === 'Failed to fetch' ? 'Não foi possível conectar ao servidor.' : err.message)
    }

    // seletor de quantidade:  [-] 1 [+]
    const seletor = criarElemento('div', 'produto-quantidade')
    const menos = criarElemento('button', '', '−')
    const qtd = criarElemento('span', '', '1')
    const mais = criarElemento('button', '', '+')
    menos.type = mais.type = 'button'
    menos.setAttribute('aria-label', 'Diminuir quantidade')
    mais.setAttribute('aria-label', 'Aumentar quantidade')
    seletor.append(menos, qtd, mais)

    let quantidade = 1
    const atualizarQtd = () => {
        qtd.textContent = quantidade
        menos.disabled = quantidade <= 1
        mais.disabled = quantidade >= produto.estoque
    }
    menos.addEventListener('click', () => { quantidade--; atualizarQtd() })
    mais.addEventListener('click', () => { quantidade++; atualizarQtd() })
    atualizarQtd()

    // adicionar ao carrinho
    const btnCarrinho = criarElemento('button', 'btn-carrinho', 'Adicionar ao carrinho')
    btnCarrinho.type = 'button'

    if (produto.estoque <= 0) {
        btnCarrinho.textContent = 'Esgotado'
        btnCarrinho.disabled = true
        menos.disabled = mais.disabled = true
    }

    // sem login também funciona: o carrinho.js guarda no localStorage até a pessoa entrar
    btnCarrinho.addEventListener('click', async () => {
        btnCarrinho.disabled = true
        btnCarrinho.textContent = 'Adicionando...'
        try {
            await window.carrinho.adicionar(produto, quantidade)
            avisar(`${quantidade} item(ns) adicionado(s) ao carrinho.`, 'sucesso')
            window.carrinho.abrir()
            quantidade = 1
            atualizarQtd()
        } catch (err) {
            tratarFalha(err) // ex.: "Só temos 3 unidade(s) de ... em estoque"
        } finally {
            btnCarrinho.disabled = false
            btnCarrinho.textContent = 'Adicionar ao carrinho'
        }
    })

    // favoritar (coração que liga/desliga)
    const btnFavorito = criarElemento('button', 'btn-favorito')
    btnFavorito.type = 'button'
    let favoritado = false
    const atualizarFavorito = () => {
        btnFavorito.textContent = favoritado ? '♥' : '♡'
        btnFavorito.classList.toggle('ativo', favoritado)
        btnFavorito.setAttribute('aria-pressed', favoritado)
        btnFavorito.setAttribute('aria-label', favoritado ? 'Remover dos favoritos' : 'Adicionar aos favoritos')
    }
    atualizarFavorito()

    // se já está logado, descobre se o produto já é favorito
    if (estaLogado()) {
        api(`/favoritos/${produto.codProduto}`)
            .then((dados) => { favoritado = dados.favoritado; atualizarFavorito() })
            .catch(() => {}) // se falhar, só fica com o coração vazio
    }

    btnFavorito.addEventListener('click', async () => {
        if (!estaLogado()) return avisarLogin()

        btnFavorito.disabled = true
        try {
            if (favoritado) {
                await api(`/favoritos/${produto.codProduto}`, { method: 'DELETE' })
            } else {
                await api('/favoritos', { method: 'POST', body: { idProduto: produto.codProduto } })
            }
            favoritado = !favoritado
            atualizarFavorito()
            avisar(favoritado ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.', 'sucesso')
        } catch (err) {
            // 409 = já era favorito / 404 = já não era: só acerta o coração
            if (err.status === 409 || err.status === 404) {
                favoritado = err.status === 409
                atualizarFavorito()
            } else {
                tratarFalha(err)
            }
        } finally {
            btnFavorito.disabled = false
        }
    })

    const linha = criarElemento('div', 'produto-acoes-linha')
    linha.append(seletor, btnCarrinho, btnFavorito)
    acoes.append(linha, aviso)
    return acoes
}

function renderizarProduto(produto) {
    document.title = `${produto.nome} | E-comerce`
    container.innerHTML = ''

    const urls = [produto.imagem_principal, ...(produto.imagens || []).map((i) => i.url_imagem)]
    const galeria = criarGaleria(urls, produto.nome)

    // ---------- informações ----------
    const info = criarElemento('div', 'produto-info')

    if (produto.categoria) {
        info.appendChild(criarElemento('span', 'produto-categoria', produto.categoria.nome))
    }
    info.appendChild(criarElemento('h1', 'produto-nome', produto.nome))
    if (produto.promocao) {
        info.appendChild(criarElemento('span', 'produto-promocao', 'Promoção'))
    }
    info.appendChild(criarElemento('span', 'produto-preco', formatarPreco(produto.preco)))
    info.appendChild(
        criarElemento(
            'span',
            'produto-estoque',
            produto.estoque > 0 ? `${produto.estoque} em estoque` : 'Esgotado'
        )
    )
    info.appendChild(criarAcoes(produto))
    info.appendChild(criarElemento('p', 'produto-descricao', produto.descricao))

    container.append(galeria, info)
}

async function carregarProduto() {
    const id = new URLSearchParams(window.location.search).get('id')

    if (!id) {
        mostrarMensagem('Produto não informado.')
        return
    }

    const headers = { 'Content-Type': 'application/json' }
    const token = localStorage.getItem('token')
    if (token) headers.authorization = `Bearer ${token}`

    try {
        const resposta = await fetch(`${API_URL}/produtos/${encodeURIComponent(id)}`, { headers })
        const dados = await resposta.json()

        if (resposta.status === 404) {
            mostrarMensagem('Produto não encontrado.')
            return
        }
        if (!resposta.ok) {
            throw new Error(dados.message || 'Erro ao carregar produto')
        }

        renderizarProduto(dados)
    } catch (err) {
        console.error(err)
        mostrarMensagem('Não foi possível carregar o produto. Tente novamente mais tarde.')
    }
}

carregarProduto()
