// Barra de categorias + busca, logo abaixo do header. Incluída em todas as páginas.
//
// - As categorias vêm do backend e ficam guardadas por 10 minutos no sessionStorage
//   (trocar de página não faz outra requisição).
// - A busca mostra sugestões enquanto a pessoa digita (no máximo 6, só depois de parar de digitar).
// - Na página de produtos, clicar numa categoria ou buscar só troca os filtros, sem recarregar
//   (o produtos.js registra window.filtrosProdutos). Nas outras páginas, vai para produtos.html.
//
// window.navbar.categorias() devolve a lista de categorias (o produtos.js usa).
// window.navbar.marcar({ categoria, busca }) acende a categoria certa e preenche a busca.
;(() => {
    const API_URL = 'http://localhost:3000'
    const CHAVE_CATEGORIAS = 'categorias'
    const VALIDADE_CATEGORIAS = 10 * 60 * 1000
    const ESPERA_SUGESTOES = 250
    const MIN_LETRAS = 2

    const naPastaHtml = window.location.pathname.includes('/html/')
    const PASTA_HTML = naPastaHtml ? './' : './html/'
    const naPaginaProdutos = /\/produtos\.html$/.test(window.location.pathname)

    const formatarPreco = (valor) =>
        Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    function criarElemento(tag, classe, texto) {
        const el = document.createElement(tag)
        if (classe) el.className = classe
        if (texto !== undefined) el.textContent = texto
        return el
    }

    const linkProdutos = (params = {}) => {
        const query = new URLSearchParams(params).toString()
        return `${PASTA_HTML}produtos.html${query ? `?${query}` : ''}`
    }

    // ---------- categorias (com cache) ----------
    let promessaCategorias = null

    function categorias() {
        if (promessaCategorias) return promessaCategorias

        try {
            const salvo = JSON.parse(sessionStorage.getItem(CHAVE_CATEGORIAS))
            if (salvo && Date.now() - salvo.em < VALIDADE_CATEGORIAS) {
                promessaCategorias = Promise.resolve(salvo.lista)
                return promessaCategorias
            }
        } catch {
            // cache estragado: busca de novo
        }

        promessaCategorias = fetch(`${API_URL}/categorias`)
            .then((r) => {
                if (!r.ok) throw new Error('Erro ao carregar categorias')
                return r.json()
            })
            .then((lista) => {
                const ordenada = [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
                try {
                    sessionStorage.setItem(CHAVE_CATEGORIAS, JSON.stringify({ em: Date.now(), lista: ordenada }))
                } catch {
                    // sem sessionStorage: segue sem cache
                }
                return ordenada
            })
            .catch((err) => {
                promessaCategorias = null // deixa tentar de novo depois
                throw err
            })
        return promessaCategorias
    }

    // ---------- estrutura ----------
    const barra = criarElemento('nav', 'barra-loja')
    barra.setAttribute('aria-label', 'Categorias e busca')

    const listaCategorias = criarElemento('ul', 'barra-categorias')

    const form = criarElemento('form', 'barra-busca')
    form.setAttribute('role', 'search')
    const input = criarElemento('input')
    input.type = 'search'
    input.name = 'busca'
    input.placeholder = 'Buscar produtos'
    input.maxLength = 100
    input.autocomplete = 'off'
    input.setAttribute('aria-label', 'Buscar produtos')
    input.setAttribute('role', 'combobox')
    input.setAttribute('aria-autocomplete', 'list')
    input.setAttribute('aria-expanded', 'false')
    input.setAttribute('aria-controls', 'barra-sugestoes')
    const btnBuscar = criarElemento('button', 'barra-busca-botao')
    btnBuscar.type = 'submit'
    btnBuscar.setAttribute('aria-label', 'Buscar')
    btnBuscar.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    const sugestoes = criarElemento('ul', 'barra-sugestoes')
    sugestoes.id = 'barra-sugestoes'
    sugestoes.setAttribute('role', 'listbox')
    sugestoes.hidden = true
    form.append(input, btnBuscar, sugestoes)

    barra.append(listaCategorias, form)

    const header = document.querySelector('header')
    if (header) header.after(barra)
    else document.body.prepend(barra)

    // ---------- links de categoria ----------
    let categoriaAtiva = naPaginaProdutos ? new URLSearchParams(window.location.search).get('categoria') : null

    function criarLinkCategoria(texto, id) {
        const li = criarElemento('li')
        const a = criarElemento('a', 'barra-categoria', texto)
        a.href = id ? linkProdutos({ categoria: id }) : linkProdutos()
        a.dataset.categoria = id ?? ''
        a.addEventListener('click', (e) => {
            if (!window.filtrosProdutos) return // outra página: segue o link normal
            e.preventDefault()
            input.value = ''
            window.filtrosProdutos.aplicar({ categoria: id ?? null, busca: null }, { limparOutros: true })
        })
        li.appendChild(a)
        return li
    }

    function marcar({ categoria = null, busca } = {}) {
        categoriaAtiva = categoria ? String(categoria) : null
        listaCategorias.querySelectorAll('.barra-categoria').forEach((a) => {
            const ativo = naPaginaProdutos && a.dataset.categoria === (categoriaAtiva ?? '')
            a.classList.toggle('ativa', ativo)
            if (ativo) a.setAttribute('aria-current', 'page')
            else a.removeAttribute('aria-current')
        })
        if (busca !== undefined && document.activeElement !== input) input.value = busca ?? ''
    }

    categorias()
        .then((lista) => {
            listaCategorias.appendChild(criarLinkCategoria('Todos'))
            lista.forEach((c) => listaCategorias.appendChild(criarLinkCategoria(c.nome, String(c.codCategoria))))
            marcar({ categoria: categoriaAtiva })
        })
        .catch(() => {
            // sem categorias, a busca continua funcionando
            listaCategorias.appendChild(criarLinkCategoria('Todos os produtos'))
        })

    if (naPaginaProdutos) input.value = new URLSearchParams(window.location.search).get('busca') || ''

    // ---------- busca ----------
    function buscar(termo) {
        fecharSugestoes()
        const t = termo.trim()
        if (window.filtrosProdutos) {
            window.filtrosProdutos.aplicar({ busca: t || null })
            input.blur()
            return
        }
        window.location.href = t ? linkProdutos({ busca: t }) : linkProdutos()
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault()
        const ativa = sugestoes.querySelector('[aria-selected="true"] a')
        if (ativa) {
            ativa.click()
            return
        }
        buscar(input.value)
    })

    // ---------- sugestões ----------
    let timerSugestoes = null
    let controleSugestoes = null
    let indiceAtivo = -1

    function fecharSugestoes() {
        clearTimeout(timerSugestoes)
        controleSugestoes?.abort()
        sugestoes.hidden = true
        sugestoes.innerHTML = ''
        indiceAtivo = -1
        input.setAttribute('aria-expanded', 'false')
        input.removeAttribute('aria-activedescendant')
    }

    function itensSugestao() {
        return [...sugestoes.querySelectorAll('[role="option"]')]
    }

    function destacar(indice) {
        const itens = itensSugestao()
        if (!itens.length) return
        indiceAtivo = (indice + itens.length) % itens.length
        itens.forEach((li, i) => li.setAttribute('aria-selected', String(i === indiceAtivo)))
        input.setAttribute('aria-activedescendant', itens[indiceAtivo].id)
        itens[indiceAtivo].scrollIntoView?.({ block: 'nearest' })
    }

    function mostrarSugestoes(termo, produtos) {
        sugestoes.innerHTML = ''
        indiceAtivo = -1

        if (!produtos.length) {
            sugestoes.appendChild(criarElemento('li', 'sugestao-vazia', `Nada encontrado para "${termo}"`))
        }

        produtos.forEach((p, i) => {
            const li = criarElemento('li', 'sugestao')
            li.id = `sugestao-${i}`
            li.setAttribute('role', 'option')
            li.setAttribute('aria-selected', 'false')
            const a = criarElemento('a')
            a.href = `${PASTA_HTML}produto.html?id=${p.codProduto}`
            a.tabIndex = -1
            const img = criarElemento('img')
            img.src = p.imagem_principal
            img.alt = ''
            img.loading = 'lazy'
            const textos = criarElemento('span', 'sugestao-textos')
            textos.append(
                criarElemento('span', 'sugestao-nome', p.nome),
                criarElemento('span', 'sugestao-categoria', p.categoria?.nome ?? '')
            )
            a.append(img, textos, criarElemento('span', 'sugestao-preco', formatarPreco(p.preco)))
            li.appendChild(a)
            sugestoes.appendChild(li)
        })

        if (produtos.length) {
            const li = criarElemento('li', 'sugestao sugestao-todos')
            li.id = `sugestao-${produtos.length}`
            li.setAttribute('role', 'option')
            li.setAttribute('aria-selected', 'false')
            const a = criarElemento('a', '', `Ver todos os resultados para "${termo}"`)
            a.href = linkProdutos({ busca: termo })
            a.tabIndex = -1
            a.addEventListener('click', (e) => {
                e.preventDefault()
                buscar(termo)
            })
            li.appendChild(a)
            sugestoes.appendChild(li)
        }

        sugestoes.hidden = false
        input.setAttribute('aria-expanded', 'true')
    }

    async function carregarSugestoes(termo) {
        controleSugestoes?.abort() // resposta de uma busca antiga não pode chegar depois da nova
        controleSugestoes = new AbortController()
        try {
            const query = new URLSearchParams({ busca: termo, limite: 6, ordenar: 'mais_vistos' })
            const r = await fetch(`${API_URL}/produtos?${query}`, { signal: controleSugestoes.signal })
            if (!r.ok) return fecharSugestoes()
            const produtos = await r.json()
            if (input.value.trim() === termo) mostrarSugestoes(termo, produtos)
        } catch (err) {
            if (err.name !== 'AbortError') fecharSugestoes()
        }
    }

    input.addEventListener('input', () => {
        clearTimeout(timerSugestoes)
        const termo = input.value.trim()
        if (termo.length < MIN_LETRAS) return fecharSugestoes()
        timerSugestoes = setTimeout(() => carregarSugestoes(termo), ESPERA_SUGESTOES)
    })

    input.addEventListener('keydown', (e) => {
        if (sugestoes.hidden) return
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            destacar(indiceAtivo + 1)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            destacar(indiceAtivo - 1)
        } else if (e.key === 'Escape') {
            fecharSugestoes()
        }
    })

    // clicou fora: fecha
    document.addEventListener('click', (e) => {
        if (!form.contains(e.target)) fecharSugestoes()
    })

    window.navbar = { categorias, marcar }
})()
