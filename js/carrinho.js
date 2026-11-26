// Sidebar do carrinho: incluído em todas as páginas, abre pelo ícone da sacola (#carrinho).
//
// O carrinho é "misto" para poupar o servidor:
// - a tela sempre lê do localStorage, então abrir o carrinho ou trocar de página não faz requisição
//   (só busca no backend se o cache tiver mais de VALIDADE_CACHE);
// - cliques em − / + mudam a tela na hora e só mandam UM PUT quando a pessoa para de clicar;
// - sem login o carrinho vive só no localStorage e é enviado ao backend quando a pessoa entra.
//
// Outras páginas usam window.carrinho.adicionar(produto, quantidade) e window.carrinho.abrir().
;(() => {
    const API_URL = 'http://localhost:3000'
    const CHAVE = 'carrinho'
    const VALIDADE_CACHE = 2 * 60 * 1000 // 2 minutos
    const ESPERA_ENVIO = 700 // ms sem clicar antes de mandar a quantidade

    // as páginas ficam em /html, só a inicial fica na raiz
    const naPastaHtml = window.location.pathname.includes('/html/')
    const PASTA_HTML = naPastaHtml ? './' : './html/'

    const formatarPreco = (valor) =>
        Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const centavos = (valor) => Math.round(Number(valor) * 100)

    const estaLogado = () => Boolean(localStorage.getItem('token'))

    // dono do cache: o código do usuário logado, ou null para visitante
    function donoAtual() {
        if (!estaLogado()) return null
        try {
            return JSON.parse(localStorage.getItem('usuario'))?.codUsuario ?? 'logado'
        } catch {
            return 'logado'
        }
    }

    function criarElemento(tag, classe, texto) {
        const el = document.createElement(tag)
        if (classe) el.className = classe
        if (texto !== undefined) el.textContent = texto
        return el
    }

    async function api(rota, { method = 'GET', body, keepalive = false } = {}) {
        const resposta = await fetch(`${API_URL}${rota}`, {
            method,
            keepalive, // deixa a requisição terminar mesmo se a página fechar
            headers: {
                'Content-Type': 'application/json',
                authorization: `Bearer ${localStorage.getItem('token')}`
            },
            body: body ? JSON.stringify(body) : undefined
        })
        const dados = resposta.status === 204 ? null : await resposta.json()
        if (!resposta.ok) {
            if (resposta.status === 401) localStorage.removeItem('token')
            const erro = new Error(dados?.message || 'Algo deu errado')
            erro.status = resposta.status
            throw erro
        }
        return dados
    }

    const mensagemDeErro = (err) =>
        err.message === 'Failed to fetch' ? 'Não foi possível conectar ao servidor.' : err.message

    // ================= estado (localStorage) =================

    const carrinhoVazio = (dono) => ({ dono, itens: [], quantidadeItens: 0, subtotal: 0, atualizadoEm: 0 })

    function lerCache() {
        try {
            const salvo = JSON.parse(localStorage.getItem(CHAVE))
            return salvo && Array.isArray(salvo.itens) ? salvo : null
        } catch {
            return null
        }
    }

    // refaz as contas na hora, sem esperar o backend (em centavos para não errar arredondamento)
    function recalcular(c) {
        let subtotal = 0
        let quantidadeItens = 0
        c.itens.forEach((item) => {
            const p = item.produto
            item.disponivel = p.ativo !== false && item.quantidade <= p.estoque
            const totalItem = centavos(p.preco) * item.quantidade
            item.subtotal = totalItem / 100
            if (item.disponivel) {
                subtotal += totalItem
                quantidadeItens += item.quantidade
            }
        })
        c.subtotal = subtotal / 100
        c.quantidadeItens = quantidadeItens
        return c
    }

    let carrinho = lerCache() || carrinhoVazio(donoAtual())

    // quantidades que mudaram na tela e ainda não foram para o backend: codItemCarrinho -> { quantidade, timer }
    const pendentes = new Map()
    // itens com DELETE em andamento (uma resposta antiga não pode trazê-los de volta)
    const removendo = new Set()

    function definir(novo) {
        carrinho = recalcular(novo)
        try {
            localStorage.setItem(CHAVE, JSON.stringify(carrinho))
        } catch {
            // sem localStorage (aba anônima bloqueada etc.): segue só na memória
        }
        atualizarContador()
        if (estaAberto()) renderizar()
    }

    // a resposta do backend é a verdade, menos o que a pessoa mudou e ainda não foi enviado
    function aplicarServidor(dados) {
        const itens = dados.itens.filter((i) => !removendo.has(i.codItemCarrinho))
        itens.forEach((item) => {
            const pendente = pendentes.get(item.codItemCarrinho)
            if (pendente) item.quantidade = pendente.quantidade
        })
        definir({ ...dados, itens, dono: donoAtual(), atualizadoEm: Date.now() })
    }

    // Token venceu (401): NÃO apaga o carrinho. Os itens ficam na tela e o que ainda não tinha
    // ido para o backend é guardado em "naoEnviados" (codItemCarrinho -> quantidade, 0 = remover)
    // para ser enviado quando a pessoa entrar de novo.
    // (sair pelo botão "Sair" do perfil é diferente: lá o cache é apagado de propósito.)
    function sessaoExpirou(extras = {}) {
        const naoEnviados = { ...(carrinho.naoEnviados || {}), ...extras }
        pendentes.forEach((p, id) => {
            clearTimeout(p.timer)
            naoEnviados[id] = p.quantidade
        })
        pendentes.clear()
        definir({ ...carrinho, naoEnviados })
        if (estaAberto()) avisar('Sua sessão expirou. Entre novamente para salvar e finalizar.')
    }

    // cache de um usuário, mas sem token válido: mostra os itens e pede login
    const sessaoExpirada = () => !estaLogado() && carrinho.dono !== null

    async function buscarDoServidor() {
        aplicarServidor(await api('/carrinho'))
    }

    // depois de entrar de novo: manda o que ficou parado quando o token venceu
    async function enviarNaoEnviados() {
        const naoEnviados = carrinho.naoEnviados || {}
        for (const [id, quantidade] of Object.entries(naoEnviados)) {
            try {
                if (quantidade > 0) {
                    await api(`/carrinho/itens/${id}`, { method: 'PUT', body: { quantidade } })
                } else {
                    await api(`/carrinho/itens/${id}`, { method: 'DELETE' })
                }
            } catch (err) {
                if (err.status === 401) return sessaoExpirou()
                // 404 (item já não existe), 409 (estoque): o GET abaixo mostra o estado real
            }
        }
        delete carrinho.naoEnviados
        await buscarDoServidor()
    }

    // deixa o cache certo para quem está usando a página agora
    async function prepararCache() {
        const dono = donoAtual()

        // visitante ou sessão expirada: tudo fica no localStorage até a pessoa entrar
        if (dono === null) return

        if (carrinho.dono === null) {
            if (carrinho.itens.length) await enviarCarrinhoVisitante()
            else await buscarDoServidor()
        } else if (carrinho.dono !== dono) {
            // entrou outra pessoa: o cache era de outro usuário, descarta
            await buscarDoServidor()
        } else if (carrinho.naoEnviados && Object.keys(carrinho.naoEnviados).length) {
            await enviarNaoEnviados()
        } else if (Date.now() - carrinho.atualizadoEm > VALIDADE_CACHE) {
            await buscarDoServidor()
        }
    }

    // ao entrar na conta, o carrinho de visitante vai para o backend numa requisição só
    const CHAVE_TRAVA = 'carrinho-mesclando'
    async function enviarCarrinhoVisitante() {
        // duas abas abertas ao entrar não podem mandar o mesmo carrinho duas vezes (somaria em dobro)
        const trava = Number(localStorage.getItem(CHAVE_TRAVA))
        if (trava && Date.now() - trava < 15000) return
        localStorage.setItem(CHAVE_TRAVA, Date.now())

        try {
            const dados = await api('/carrinho/merge', {
                method: 'POST',
                body: {
                    itens: carrinho.itens.map((i) => ({ idProduto: i.produto.codProduto, quantidade: i.quantidade }))
                }
            })
            aplicarServidor(dados)
            if (dados.naoAdicionados?.length) {
                avisoGuardado = `Alguns itens não couberam no estoque: ${dados.naoAdicionados
                    .map((i) => i.motivo)
                    .join(' / ')}`
                if (estaAberto()) avisar(avisoGuardado)
            }
        } finally {
            // se falhou (rede, 401), o carrinho de visitante continua no cache e tenta de novo depois
            localStorage.removeItem(CHAVE_TRAVA)
        }
    }

    // ================= envio das alterações =================

    function agendarEnvio(idItem, quantidade) {
        const anterior = pendentes.get(idItem)
        if (anterior) clearTimeout(anterior.timer)
        const timer = setTimeout(() => enviarPendente(idItem), ESPERA_ENVIO)
        pendentes.set(idItem, { quantidade, timer })
    }

    async function enviarPendente(idItem, { keepalive = false } = {}) {
        const pendente = pendentes.get(idItem)
        if (!pendente) return
        clearTimeout(pendente.timer)
        pendentes.delete(idItem)

        try {
            const dados = await api(`/carrinho/itens/${idItem}`, {
                method: 'PUT',
                body: { quantidade: pendente.quantidade },
                keepalive
            })
            aplicarServidor(dados)
        } catch (err) {
            if (err.status === 401) return sessaoExpirou({ [idItem]: pendente.quantidade })
            await buscarDoServidor().catch(() => {}) // volta a tela ao estado real
            avisar(mensagemDeErro(err)) // ex.: "Só temos 3 unidade(s) de ..."
        }
    }

    const enviarTodosPendentes = (opcoes) =>
        Promise.all([...pendentes.keys()].map((id) => enviarPendente(id, opcoes)))

    // saindo da página ou trocando de aba: manda o que falta na hora
    window.addEventListener('pagehide', () => enviarTodosPendentes({ keepalive: true }))
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') enviarTodosPendentes({ keepalive: true })
    })

    // outra aba mexeu no carrinho: acompanha sem pedir ao servidor
    window.addEventListener('storage', (e) => {
        if (e.key !== CHAVE) return
        carrinho = lerCache() || carrinhoVazio(donoAtual())
        atualizarContador()
        if (estaAberto()) renderizar()
    })

    // ================= ações =================

    function alterarQuantidade(item, novaQtd) {
        if (novaQtd < 1) return
        if (novaQtd > item.produto.estoque) {
            avisar(`Só temos ${item.produto.estoque} unidade(s) de ${item.produto.nome} em estoque`)
            return
        }

        item.quantidade = novaQtd

        if (sessaoExpirada()) {
            // guarda para mandar depois do login
            definir({ ...carrinho, naoEnviados: { ...carrinho.naoEnviados, [item.codItemCarrinho]: novaQtd } })
            return
        }

        definir(carrinho)
        if (estaLogado()) agendarEnvio(item.codItemCarrinho, novaQtd)
    }

    async function remover(item) {
        const itens = carrinho.itens.filter((i) => i !== item)
        const id = item.codItemCarrinho

        if (sessaoExpirada()) {
            definir({ ...carrinho, itens, naoEnviados: { ...carrinho.naoEnviados, [id]: 0 } })
            return
        }

        definir({ ...carrinho, itens })
        if (!estaLogado()) return

        const pendente = pendentes.get(id)
        if (pendente) {
            clearTimeout(pendente.timer)
            pendentes.delete(id)
        }

        removendo.add(id)
        try {
            aplicarServidor(await api(`/carrinho/itens/${id}`, { method: 'DELETE' }))
        } catch (err) {
            if (err.status === 401) return sessaoExpirou({ [id]: 0 })
            await buscarDoServidor().catch(() => {})
            avisar(mensagemDeErro(err))
        } finally {
            removendo.delete(id)
        }
    }

    // usado pela página do produto
    async function adicionar(produto, quantidade = 1) {
        if (sessaoExpirada()) {
            // a página do produto trata 401 mostrando "Entre na sua conta para continuar"
            const erro = new Error('Sua sessão expirou. Entre novamente.')
            erro.status = 401
            throw erro
        }

        if (estaLogado()) {
            await enviarTodosPendentes() // a resposta do POST já deve vir com tudo em dia
            aplicarServidor(
                await api('/carrinho/itens', {
                    method: 'POST',
                    body: { idProduto: produto.codProduto, quantidade }
                })
            )
            return
        }

        // visitante: só no localStorage, com a mesma regra de estoque do backend
        const existente = carrinho.itens.find((i) => i.produto.codProduto === produto.codProduto)
        const novaQtd = (existente ? existente.quantidade : 0) + quantidade

        if (novaQtd > produto.estoque) {
            throw new Error(
                produto.estoque === 0
                    ? `${produto.nome} está sem estoque`
                    : `Só temos ${produto.estoque} unidade(s) de ${produto.nome} em estoque`
            )
        }

        const resumo = {
            codProduto: produto.codProduto,
            nome: produto.nome,
            preco: produto.preco,
            estoque: produto.estoque,
            imagem_principal: produto.imagem_principal,
            promocao: produto.promocao,
            ativo: produto.ativo !== false
        }

        if (existente) {
            existente.quantidade = novaQtd
            existente.produto = resumo // aproveita para atualizar preço e estoque
        } else {
            carrinho.itens.push({ codItemCarrinho: null, quantidade, produto: resumo })
        }
        definir(carrinho)
    }

    // ================= sidebar =================

    const fundo = criarElemento('div', 'carrinho-fundo')

    const painel = criarElemento('aside', 'carrinho-painel')
    painel.setAttribute('aria-label', 'Carrinho')
    painel.setAttribute('role', 'dialog')
    painel.inert = true // fechado: fora do Tab e dos leitores de tela

    const topo = criarElemento('div', 'carrinho-topo')
    const btnFechar = criarElemento('button', 'carrinho-fechar', '×')
    btnFechar.type = 'button'
    btnFechar.setAttribute('aria-label', 'Fechar carrinho')
    topo.append(criarElemento('h2', 'carrinho-titulo', 'Carrinho'), btnFechar)

    const lista = criarElemento('div', 'carrinho-lista')

    const rodape = criarElemento('div', 'carrinho-rodape')
    const linhaTotal = criarElemento('div', 'carrinho-total')
    const valorTotal = criarElemento('span')
    linhaTotal.append(criarElemento('span', '', 'Subtotal'), valorTotal)
    const aviso = criarElemento('p', 'carrinho-aviso')
    aviso.setAttribute('role', 'status')
    aviso.hidden = true
    const btnFinalizar = criarElemento('button', 'btn-login', 'Finalizar compra')
    btnFinalizar.type = 'button'
    rodape.append(linhaTotal, aviso, btnFinalizar)

    painel.append(topo, lista, rodape)

    const icone = document.querySelector('#carrinho')
    const contador = criarElemento('span', 'carrinho-contador')
    contador.hidden = true

    let avisoGuardado = null // aviso para mostrar na próxima vez que o carrinho abrir

    function avisar(texto, tipo = 'erro') {
        aviso.textContent = texto
        aviso.className = `carrinho-aviso ${tipo}`
        aviso.hidden = false
    }

    function atualizarContador() {
        const qtd = carrinho.quantidadeItens
        contador.textContent = qtd > 99 ? '99+' : qtd
        contador.hidden = !qtd
    }

    // ---------- abrir / fechar ----------
    let ultimoFoco = null
    const estaAberto = () => document.body.classList.contains('carrinho-aberto')

    function abrir() {
        ultimoFoco = document.activeElement
        document.body.classList.add('carrinho-aberto')
        painel.inert = false
        btnFechar.focus()

        renderizar() // mostra o cache na hora
        if (avisoGuardado) {
            avisar(avisoGuardado)
            avisoGuardado = null
        }
        prepararCache().catch((err) => avisar(mensagemDeErro(err))) // só vai ao servidor se o cache venceu
    }

    function fechar() {
        document.body.classList.remove('carrinho-aberto')
        painel.inert = true
        ultimoFoco?.focus?.()
        enviarTodosPendentes() // fechou: não precisa esperar o tempo do agrupamento
    }

    fundo.addEventListener('click', fechar)
    btnFechar.addEventListener('click', fechar)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && estaAberto()) fechar()
    })

    // ---------- conteúdo ----------
    function linkLogin() {
        // volta para a página atual depois do login
        const voltar = naPastaHtml
            ? window.location.pathname.split('/').pop() + window.location.search
            : '../index.html'
        return `${PASTA_HTML}login.html?voltar=${encodeURIComponent(voltar)}`
    }

    function criarItem(item) {
        const { produto } = item
        const linha = criarElemento('div', 'carrinho-item')
        if (!item.disponivel) linha.classList.add('indisponivel')

        const linkProduto = `${PASTA_HTML}produto.html?id=${produto.codProduto}`

        const linkImg = criarElemento('a', 'carrinho-item-img')
        linkImg.href = linkProduto
        const img = criarElemento('img')
        img.src = produto.imagem_principal
        img.alt = produto.nome
        linkImg.appendChild(img)

        const info = criarElemento('div', 'carrinho-item-info')
        const nome = criarElemento('a', 'carrinho-item-nome', produto.nome)
        nome.href = linkProduto
        info.append(nome, criarElemento('span', 'carrinho-item-preco', formatarPreco(produto.preco)))

        if (!item.disponivel) {
            const motivo = produto.ativo === false || produto.estoque === 0
                ? 'Indisponível'
                : `Só ${produto.estoque} em estoque`
            info.appendChild(criarElemento('span', 'carrinho-item-alerta', motivo))
        }

        // [-] 2 [+]   Remover
        const controles = criarElemento('div', 'carrinho-item-controles')
        const seletor = criarElemento('div', 'produto-quantidade')
        const menos = criarElemento('button', '', '−')
        const qtd = criarElemento('span', '', item.quantidade)
        const mais = criarElemento('button', '', '+')
        menos.type = mais.type = 'button'
        menos.setAttribute('aria-label', `Diminuir quantidade de ${produto.nome}`)
        mais.setAttribute('aria-label', `Aumentar quantidade de ${produto.nome}`)
        menos.disabled = item.quantidade <= 1 || produto.ativo === false
        mais.disabled = item.quantidade >= produto.estoque || produto.ativo === false
        seletor.append(menos, qtd, mais)

        const btnRemover = criarElemento('button', 'carrinho-item-remover', 'Remover')
        btnRemover.type = 'button'

        menos.addEventListener('click', () => alterarQuantidade(item, item.quantidade - 1))
        mais.addEventListener('click', () => alterarQuantidade(item, item.quantidade + 1))
        btnRemover.addEventListener('click', () => remover(item))

        controles.append(seletor, btnRemover)
        info.appendChild(controles)
        linha.append(linkImg, info, criarElemento('span', 'carrinho-item-subtotal', formatarPreco(item.subtotal)))
        return linha
    }

    function mostrarVazio(texto, rotuloBotao, href) {
        rodape.hidden = true
        const vazio = criarElemento('div', 'carrinho-vazio')
        vazio.appendChild(criarElemento('p', '', texto))
        const link = criarElemento('a', 'btn-login', rotuloBotao)
        link.href = href
        vazio.appendChild(link)
        lista.appendChild(vazio)
        return vazio
    }

    function renderizar() {
        // re-renderizar troca os botões: guarda qual estava com foco para devolver depois
        const focado = lista.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null

        lista.innerHTML = ''

        if (!carrinho.itens.length) {
            // logado sem cache ainda: está buscando no servidor
            if (estaLogado() && carrinho.dono !== donoAtual()) {
                rodape.hidden = true
                lista.appendChild(criarElemento('p', 'carrinho-vazio', 'Carregando...'))
                return
            }
            mostrarVazio('Seu carrinho está vazio.', 'Ver produtos', `${PASTA_HTML}produtos.html`)
            return
        }

        rodape.hidden = false
        carrinho.itens.forEach((item) => lista.appendChild(criarItem(item)))
        valorTotal.textContent = formatarPreco(carrinho.subtotal)

        if (!estaLogado()) {
            btnFinalizar.textContent = 'Entrar para finalizar'
            btnFinalizar.disabled = false
            if (sessaoExpirada()) avisar('Sua sessão expirou. Entre novamente para salvar e finalizar.')
        } else {
            btnFinalizar.textContent = 'Finalizar compra'
            // com item indisponível o backend recusa o pedido, então avisa antes
            const temProblema = carrinho.itens.some((i) => !i.disponivel)
            btnFinalizar.disabled = temProblema
            if (temProblema) avisar('Ajuste ou remova os itens indisponíveis para finalizar.')
        }

        if (focado) lista.querySelector(`[aria-label="${CSS.escape(focado)}"]`)?.focus()
    }

    btnFinalizar.addEventListener('click', async () => {
        if (!estaLogado()) {
            window.location.href = linkLogin()
            return
        }

        btnFinalizar.disabled = true
        btnFinalizar.textContent = 'Finalizando...'
        aviso.hidden = true
        try {
            await enviarTodosPendentes() // o pedido precisa sair com as quantidades da tela
            const pedido = await api('/pedidos', { method: 'POST' })
            definir({ ...carrinhoVazio(donoAtual()), atualizadoEm: Date.now() }) // o backend esvaziou o carrinho

            const vazio = lista.querySelector('.carrinho-vazio')
            const numero = pedido?.codPedido ? ` #${pedido.codPedido}` : ''
            vazio?.prepend(criarElemento('p', 'carrinho-sucesso', `Pedido${numero} realizado com sucesso!`))
        } catch (err) {
            if (err.status === 401) return sessaoExpirou() // os itens continuam no carrinho
            avisar(mensagemDeErro(err)) // ex.: "Só temos 2 unidade(s) de ..."
            buscarDoServidor().catch(() => {})
        } finally {
            btnFinalizar.disabled = false
            if (estaLogado() && carrinho.itens.length) btnFinalizar.textContent = 'Finalizar compra'
        }
    })

    // ================= monta na página =================
    document.body.append(fundo, painel)

    if (icone) {
        // o ícone é um <a> sem href: vira botão de verdade para teclado e leitor de tela
        icone.setAttribute('role', 'button')
        icone.tabIndex = 0
        icone.appendChild(contador)
        icone.addEventListener('click', (e) => {
            e.preventDefault()
            abrir()
        })
        icone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                abrir()
            }
        })
    }

    // contador sai do cache; o servidor só é chamado se o cache venceu ou se tem carrinho de visitante para enviar
    atualizarContador()
    prepararCache().catch(() => {})

    window.carrinho = { abrir, fechar, adicionar }
})()
