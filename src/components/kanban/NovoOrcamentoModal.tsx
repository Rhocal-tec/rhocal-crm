'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useEmpresa } from '@/contexts/EmpresaContext'
import { Modal } from '@/components/ui/Modal'
import { formatarTelefoneInput } from '@/lib/kanban/formatacao'

type StatusCodigoOmie = 'idle' | 'buscando' | 'encontrado' | 'nao_encontrado' | 'erro'

// Mesmo mínimo exigido pela própria API do Omie para busca por nome parcial
// (abaixo disso ela retorna erro de validação).
const MIN_CARACTERES_BUSCA_CLIENTE = 3
const DEBOUNCE_BUSCA_CLIENTE_MS = 400

interface ClienteOmieSugestao {
  codigoClienteOmie: number
  razaoSocial: string
  nomeFantasia: string | null
  cnpjCpf: string | null
}

// Dados capturados da Receita Federal (fase 23) que não são usados para
// preencher o pedido diretamente, mas servem de base para pré-preencher o
// formulário de cadastro do cliente no Omie (fase 24).
interface DadosReceitaCadastro {
  razaoSocial: string
  nomeFantasia: string
  telefoneDdd: string
  telefoneNumero: string
  logradouro: string
  numero: string
  bairro: string
  municipio: string
  uf: string
  cep: string
}

interface CadastroOmieForm {
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  telefoneDdd: string
  telefoneNumero: string
  logradouro: string
  enderecoNumero: string
  bairro: string
  cidade: string
  estado: string
  cep: string
  email: string
}

function cadastroFormVazio(): CadastroOmieForm {
  return {
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    telefoneDdd: '',
    telefoneNumero: '',
    logradouro: '',
    enderecoNumero: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: '',
    email: '',
  }
}

interface ItemForm {
  codigo: string
  codigoProdutoOmie: number | null
  statusCodigo: StatusCodigoOmie
  descricao: string
  quantidade: string
  ca: string
  tamanho: string
  numero: string
  cor: string
  observacao: string
  precoVenda: string
  emEstoque: boolean
}

function itemVazio(): ItemForm {
  return {
    codigo: '',
    codigoProdutoOmie: null,
    statusCodigo: 'idle',
    descricao: '',
    quantidade: '1',
    ca: '',
    tamanho: '',
    numero: '',
    cor: '',
    observacao: '',
    precoVenda: '',
    emEstoque: false,
  }
}

export function NovoOrcamentoModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { user } = useAuth()
  const { empresaAtiva } = useEmpresa()
  const [supabase] = useState(() => createClient())
  const [cnpj, setCnpj] = useState('')
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [avisoCnpj, setAvisoCnpj] = useState<string | null>(null)
  const [clienteOmieId, setClienteOmieId] = useState<number | null>(null)
  const [clienteNome, setClienteNome] = useState('')
  const [sugestoesCliente, setSugestoesCliente] = useState<ClienteOmieSugestao[]>([])
  const [buscandoCliente, setBuscandoCliente] = useState(false)
  const [dropdownClienteAberto, setDropdownClienteAberto] = useState(false)
  // Timer de debounce não entra no estado — não deve disparar re-render.
  const debounceClienteRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [clienteTelefone, setClienteTelefone] = useState('')
  const [clienteContato, setClienteContato] = useState('')
  const [dadosReceita, setDadosReceita] = useState<DadosReceitaCadastro | null>(null)
  const [cadastroOmieAberto, setCadastroOmieAberto] = useState(false)
  const [cadastroForm, setCadastroForm] = useState<CadastroOmieForm>(cadastroFormVazio())
  const [cadastrandoOmie, setCadastrandoOmie] = useState(false)
  const [erroCadastroOmie, setErroCadastroOmie] = useState<string | null>(null)
  const [sucessoCadastroOmie, setSucessoCadastroOmie] = useState<string | null>(null)
  const [orcamentoDireto, setOrcamentoDireto] = useState(false)
  const [itens, setItens] = useState<ItemForm[]>([itemVazio()])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Some a confirmação de cadastro no Omie automaticamente após alguns segundos.
  useEffect(() => {
    if (!sucessoCadastroOmie) return
    const timeout = setTimeout(() => setSucessoCadastroOmie(null), 6000)
    return () => clearTimeout(timeout)
  }, [sucessoCadastroOmie])

  function resetar() {
    setCnpj('')
    setBuscandoCnpj(false)
    setAvisoCnpj(null)
    setClienteOmieId(null)
    setClienteNome('')
    setSugestoesCliente([])
    setBuscandoCliente(false)
    setDropdownClienteAberto(false)
    if (debounceClienteRef.current) clearTimeout(debounceClienteRef.current)
    setClienteTelefone('')
    setClienteContato('')
    setDadosReceita(null)
    setCadastroOmieAberto(false)
    setCadastroForm(cadastroFormVazio())
    setCadastrandoOmie(false)
    setErroCadastroOmie(null)
    setSucessoCadastroOmie(null)
    setOrcamentoDireto(false)
    setItens([itemVazio()])
    setErro(null)
  }

  async function buscarClientesPorNome(termo: string) {
    setBuscandoCliente(true)
    try {
      const resposta = await fetch('/api/omie/buscar-clientes-nome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: termo, empresaSlug: empresaAtiva?.slug }),
      })
      const dados = await resposta.json().catch(() => null)
      if (resposta.ok && dados && Array.isArray(dados.clientes)) {
        setSugestoesCliente(dados.clientes)
      }
    } finally {
      setBuscandoCliente(false)
    }
  }

  // Digitar de novo invalida o vínculo com o Omie que uma seleção anterior
  // (ou a busca por CNPJ) tenha estabelecido, e reagenda a busca (debounce).
  function atualizarClienteNome(valor: string) {
    setClienteNome(valor)
    setClienteOmieId(null)
    setDropdownClienteAberto(true)

    if (debounceClienteRef.current) clearTimeout(debounceClienteRef.current)

    const termo = valor.trim()
    if (termo.length < MIN_CARACTERES_BUSCA_CLIENTE) {
      setSugestoesCliente([])
      return
    }

    debounceClienteRef.current = setTimeout(
      () => buscarClientesPorNome(termo),
      DEBOUNCE_BUSCA_CLIENTE_MS,
    )
  }

  function selecionarCliente(cliente: ClienteOmieSugestao) {
    setClienteNome(cliente.razaoSocial)
    setClienteOmieId(cliente.codigoClienteOmie)
    if (cliente.cnpjCpf) setCnpj(cliente.cnpjCpf)
    setSugestoesCliente([])
    setDropdownClienteAberto(false)
  }

  async function handleBlurCnpj() {
    const digitos = cnpj.replace(/\D/g, '')
    if (digitos.length !== 14) {
      setAvisoCnpj(null)
      return
    }

    setAvisoCnpj(null)
    setBuscandoCnpj(true)
    try {
      const resposta = await fetch('/api/omie/buscar-cliente-cnpj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: digitos, empresaSlug: empresaAtiva?.slug }),
      })
      const dados = await resposta.json().catch(() => null)

      if (!resposta.ok || !dados || dados.erro) {
        setClienteOmieId(null)
        setAvisoCnpj('Não foi possível consultar o Omie agora. Preencha o nome manualmente.')
        return
      }

      if (dados.encontrado && dados.cliente) {
        setClienteNome(dados.cliente.razaoSocial)
        setClienteOmieId(dados.cliente.codigoClienteOmie)
        if (dados.cliente.cnpjCpf) setCnpj(dados.cliente.cnpjCpf)
        setAvisoCnpj(null)
        return
      }

      // Não encontrado no Omie — cai para o fallback da Receita Federal
      // (fase 23), que só preenche nome/telefone (o cliente ainda não tem
      // codigo_cliente_omie, então clienteOmieId continua vazio).
      setClienteOmieId(null)
      await buscarCnpjReceita(digitos)
    } catch {
      // Falha inesperada na chamada ao Omie (ex: rede) — sem este catch, a
      // exceção vazava como unhandled rejection e o fallback da Receita nunca
      // era chamado, sem nenhum aviso aparecer na tela.
      setClienteOmieId(null)
      setAvisoCnpj('Não foi possível consultar o Omie agora. Preencha o nome manualmente.')
    } finally {
      setBuscandoCnpj(false)
    }
  }

  async function buscarCnpjReceita(digitos: string) {
    // Falha de rede/timeout da BrasilAPI é tratada de forma silenciosa: cai
    // direto para a mensagem padrão de "não encontrado, preencha manualmente"
    // sem expor o motivo técnico nem travar a tela — o usuário só precisa
    // saber que precisa preencher o nome na mão.
    try {
      const resposta = await fetch('/api/cnpj/consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: digitos }),
      })
      const dados = await resposta.json().catch(() => null)

      if (resposta.ok && dados && !dados.erro && dados.encontrado && dados.cliente) {
        const nome = dados.cliente.razaoSocial || dados.cliente.nomeFantasia
        if (nome) setClienteNome(nome)
        if (dados.cliente.telefone && !clienteTelefone.trim()) {
          setClienteTelefone(formatarTelefoneInput(dados.cliente.telefone))
        }
        // Campos extras (fase 24) não preenchem nada no pedido diretamente —
        // ficam guardados só para pré-preencher o formulário de cadastro no
        // Omie, caso o comercial decida cadastrar esse cliente por lá.
        setDadosReceita({
          razaoSocial: dados.cliente.razaoSocial ?? '',
          nomeFantasia: dados.cliente.nomeFantasia ?? '',
          telefoneDdd: dados.cliente.telefoneDdd ?? '',
          telefoneNumero: dados.cliente.telefoneNumero ?? '',
          logradouro: dados.cliente.logradouro ?? '',
          numero: dados.cliente.numero ?? '',
          bairro: dados.cliente.bairro ?? '',
          municipio: dados.cliente.municipio ?? '',
          uf: dados.cliente.uf ?? '',
          cep: dados.cliente.cep ?? '',
        })
        setAvisoCnpj('Cliente encontrado na Receita Federal, mas ainda não está cadastrado no Omie.')
        return
      }
    } catch {
      // Rede/timeout: segue para o fallback abaixo sem mostrar erro técnico.
    }

    setAvisoCnpj('CNPJ não encontrado no Omie — preencha o nome manualmente.')
  }

  // Abre o formulário de cadastro (fase 24) já pré-preenchido com o que a
  // Receita Federal devolveu (quando disponível) ou com o que já foi digitado
  // no formulário do pedido — tudo permanece editável antes de confirmar.
  function abrirCadastroOmie() {
    setErroCadastroOmie(null)
    setSucessoCadastroOmie(null)
    const digitosTelefone = clienteTelefone.replace(/\D/g, '')
    const dddDigitado = digitosTelefone.length >= 10 ? digitosTelefone.slice(0, 2) : ''
    const numeroDigitado = digitosTelefone.length >= 10 ? digitosTelefone.slice(2) : ''

    setCadastroForm({
      razaoSocial: dadosReceita?.razaoSocial || clienteNome,
      nomeFantasia: dadosReceita?.nomeFantasia || '',
      cnpj: cnpj.replace(/\D/g, ''),
      telefoneDdd: dadosReceita?.telefoneDdd || dddDigitado,
      telefoneNumero: dadosReceita?.telefoneNumero || numeroDigitado,
      logradouro: dadosReceita?.logradouro || '',
      enderecoNumero: dadosReceita?.numero || '',
      bairro: dadosReceita?.bairro || '',
      cidade: dadosReceita?.municipio || '',
      estado: dadosReceita?.uf || '',
      cep: dadosReceita?.cep || '',
      email: '',
    })
    setCadastroOmieAberto(true)
  }

  function atualizarCadastroForm(campo: keyof CadastroOmieForm, valor: string) {
    setCadastroForm((atual) => ({ ...atual, [campo]: valor }))
  }

  async function confirmarCadastroOmie() {
    setErroCadastroOmie(null)

    const cnpjDigitos = cadastroForm.cnpj.replace(/\D/g, '')
    if (!cadastroForm.razaoSocial.trim()) {
      setErroCadastroOmie('Informe a razão social.')
      return
    }
    if (cnpjDigitos.length !== 14) {
      setErroCadastroOmie('Informe um CNPJ válido (14 dígitos).')
      return
    }

    setCadastrandoOmie(true)
    try {
      const resposta = await fetch('/api/omie/cadastrar-cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razaoSocial: cadastroForm.razaoSocial.trim(),
          nomeFantasia: cadastroForm.nomeFantasia.trim(),
          cnpj: cnpjDigitos,
          telefoneDdd: cadastroForm.telefoneDdd.trim(),
          telefoneNumero: cadastroForm.telefoneNumero.trim(),
          endereco: cadastroForm.logradouro.trim(),
          enderecoNumero: cadastroForm.enderecoNumero.trim(),
          bairro: cadastroForm.bairro.trim(),
          cidade: cadastroForm.cidade.trim(),
          estado: cadastroForm.estado.trim(),
          email: cadastroForm.email.trim(),
          empresaSlug: empresaAtiva?.slug,
        }),
      })
      const dados = await resposta.json().catch(() => null)

      if (!resposta.ok || !dados || dados.erro || typeof dados.codigoClienteOmie !== 'number') {
        setErroCadastroOmie(
          dados?.erro ?? 'Não foi possível cadastrar o cliente no Omie agora. Tente novamente.',
        )
        return
      }

      setClienteOmieId(dados.codigoClienteOmie)
      setClienteNome(cadastroForm.razaoSocial.trim())
      setCnpj(cnpjDigitos)
      setCadastroOmieAberto(false)
      setSucessoCadastroOmie('Cliente cadastrado no Omie com sucesso.')
    } catch {
      setErroCadastroOmie('Não foi possível cadastrar o cliente no Omie agora. Tente novamente.')
    } finally {
      setCadastrandoOmie(false)
    }
  }

  function fechar() {
    if (salvando) return
    resetar()
    onClose()
  }

  function atualizarItem(index: number, campo: keyof ItemForm, valor: string) {
    setItens((atual) =>
      atual.map((item, i) => (i === index ? { ...item, [campo]: valor } : item)),
    )
  }

  function alternarEmEstoque(index: number, valor: boolean) {
    setItens((atual) =>
      atual.map((item, i) => (i === index ? { ...item, emEstoque: valor } : item)),
    )
  }

  // Digitar de novo o código invalida o vínculo anterior — só é revalidado
  // quando o campo perde o foco de novo.
  function atualizarCodigo(index: number, valor: string) {
    setItens((atual) =>
      atual.map((item, i) =>
        i === index
          ? { ...item, codigo: valor, statusCodigo: 'idle', codigoProdutoOmie: null }
          : item,
      ),
    )
  }

  async function handleBlurCodigo(index: number) {
    const codigo = itens[index]?.codigo.trim()
    if (!codigo) {
      setItens((atual) =>
        atual.map((item, i) =>
          i === index ? { ...item, statusCodigo: 'idle', codigoProdutoOmie: null } : item,
        ),
      )
      return
    }

    setItens((atual) =>
      atual.map((item, i) => (i === index ? { ...item, statusCodigo: 'buscando' } : item)),
    )

    try {
      const resposta = await fetch('/api/omie/buscar-produto-codigo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, empresaSlug: empresaAtiva?.slug }),
      })
      const dados = await resposta.json().catch(() => null)

      if (!resposta.ok || !dados || dados.erro) {
        setItens((atual) =>
          atual.map((item, i) => (i === index ? { ...item, statusCodigo: 'erro' } : item)),
        )
        return
      }

      if (dados.encontrado && dados.produto) {
        setItens((atual) =>
          atual.map((item, i) =>
            i === index
              ? {
                  ...item,
                  descricao: dados.produto.descricao,
                  codigoProdutoOmie: dados.produto.codigoProduto,
                  statusCodigo: 'encontrado',
                }
              : item,
          ),
        )
      } else {
        setItens((atual) =>
          atual.map((item, i) =>
            i === index
              ? { ...item, statusCodigo: 'nao_encontrado', codigoProdutoOmie: null }
              : item,
          ),
        )
      }
    } catch {
      setItens((atual) =>
        atual.map((item, i) => (i === index ? { ...item, statusCodigo: 'erro' } : item)),
      )
    }
  }

  function adicionarItem() {
    setItens((atual) => [...atual, itemVazio()])
  }

  function removerItem(index: number) {
    setItens((atual) => atual.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)

    if (!user) return

    if (!empresaAtiva) {
      setErro('Não foi possível identificar a empresa ativa. Recarregue a página.')
      return
    }

    const clienteValido = clienteNome.trim()
    if (!clienteValido) {
      setErro('Informe o nome do cliente.')
      return
    }

    // Preço de venda é preenchível na criação tanto no orçamento direto
    // (todos os itens, obrigatório) quanto por item marcado como em estoque
    // (opcional — o item não depende de custo vindo de cotação, ver fase 26).
    const itensValidos = itens.map((item) => {
      const precoVendaDigitado = item.precoVenda.trim() === '' ? null : Number(item.precoVenda)
      const precoVenda =
        (orcamentoDireto || item.emEstoque) &&
        precoVendaDigitado !== null &&
        Number.isFinite(precoVendaDigitado)
          ? precoVendaDigitado
          : null

      return {
        descricao: item.descricao.trim(),
        quantidade: Number(item.quantidade),
        ca: item.ca.trim() || null,
        tamanho: item.tamanho.trim() || null,
        numero: item.numero.trim() || null,
        cor: item.cor.trim() || null,
        observacao: item.observacao.trim() || null,
        codigo_produto_omie: item.codigoProdutoOmie,
        preco_venda: precoVenda,
        em_estoque: item.emEstoque,
      }
    })

    if (itensValidos.length === 0) {
      setErro('Adicione ao menos um item.')
      return
    }
    const itemInvalido = itensValidos.find(
      (item) => !item.descricao || !Number.isFinite(item.quantidade) || item.quantidade <= 0,
    )
    if (itemInvalido) {
      setErro('Cada item precisa de descrição e quantidade maior que zero.')
      return
    }
    if (orcamentoDireto) {
      const itemSemPreco = itensValidos.find(
        (item) => item.preco_venda === null || !Number.isFinite(item.preco_venda) || item.preco_venda <= 0,
      )
      if (itemSemPreco) {
        setErro('No orçamento direto, cada item precisa de um preço de venda maior que zero.')
        return
      }
    }

    setSalvando(true)

    const { data: pedido, error: erroPedido } = await supabase
      .from('pedidos')
      .insert({
        cliente_nome: clienteValido,
        cliente_omie_id: clienteOmieId,
        cliente_telefone: clienteTelefone.trim() || null,
        cliente_contato: clienteContato.trim() || null,
        cliente_cnpj: cnpj.trim() || null,
        // Orçamento direto pula PEDIDO e as etapas de cotação — o comercial já
        // define o preço na hora, sem depender do custo liberado por compras.
        status: orcamentoDireto ? 'APROVADO_CLIENTE' : undefined,
        orcamento_direto: orcamentoDireto,
        criado_por: user.id,
        empresa_id: empresaAtiva.id,
      })
      .select()
      .single()

    if (erroPedido || !pedido) {
      setErro('Não foi possível criar o orçamento. Tente novamente.')
      setSalvando(false)
      return
    }

    const { error: erroItens } = await supabase.from('pedido_itens').insert(
      itensValidos.map((item) => ({
        pedido_id: pedido.id,
        descricao: item.descricao,
        quantidade: item.quantidade,
        ca: item.ca,
        tamanho: item.tamanho,
        numero: item.numero,
        cor: item.cor,
        observacao: item.observacao,
        codigo_produto_omie: item.codigo_produto_omie,
        preco_venda: item.preco_venda,
        em_estoque: item.em_estoque,
      })),
    )

    if (erroItens) {
      setErro(
        'O orçamento foi criado, mas houve um erro ao salvar os itens. Abra o pedido para conferir.',
      )
      setSalvando(false)
      return
    }

    setSalvando(false)
    resetar()
    onClose()
  }

  return (
    <Modal open={open} onClose={fechar} title="Novo Orçamento" widthClassName="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-accent-compras/30 bg-accent-compras/10 px-3 py-2.5">
          <input
            type="checkbox"
            checked={orcamentoDireto}
            onChange={(e) => setOrcamentoDireto(e.target.checked)}
            disabled={salvando}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent-compras"
          />
          <span>
            <span className="block text-sm font-medium text-primary">
              Orçamento direto (sem cotação do Compras)
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              O pedido nasce direto em PEDIDO APROVADO, com o preço de venda definido agora por
              item — pula ORÇAMENTO e as etapas de cotação.
            </span>
          </span>
        </label>

        <div>
          <label className="block text-sm font-medium text-primary/80">CNPJ (opcional)</label>
          <div className="relative mt-1">
            <input
              type="text"
              inputMode="numeric"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              onBlur={handleBlurCnpj}
              className="input-field w-full rounded-md px-3 py-2 pr-9 text-sm"
              placeholder="00.000.000/0000-00"
              disabled={salvando}
            />
            {buscandoCnpj && (
              <span
                aria-hidden="true"
                className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-accent-primary"
              />
            )}
          </div>
          {avisoCnpj && <p className="mt-1 text-xs text-muted">{avisoCnpj}</p>}
        </div>

        <div className="relative">
          <label className="block text-sm font-medium text-primary/80">Nome do cliente</label>
          <div className="relative mt-1">
            <input
              type="text"
              value={clienteNome}
              onChange={(e) => atualizarClienteNome(e.target.value)}
              onFocus={() => setDropdownClienteAberto(true)}
              onBlur={() => setTimeout(() => setDropdownClienteAberto(false), 150)}
              autoComplete="off"
              className="input-field w-full rounded-md px-3 py-2 pr-9 text-sm"
              placeholder="Ex: Cliente Teste LTDA"
              disabled={salvando}
            />
            {buscandoCliente && (
              <span
                aria-hidden="true"
                className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-accent-primary"
              />
            )}
          </div>
          {dropdownClienteAberto && sugestoesCliente.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-white/10 bg-surface-alt py-1 shadow-lg">
              {sugestoesCliente.map((cliente) => (
                <li key={cliente.codigoClienteOmie}>
                  <button
                    type="button"
                    onMouseDown={() => selecionarCliente(cliente)}
                    className="block w-full truncate px-3 py-1.5 text-left text-sm text-primary hover:bg-white/10"
                  >
                    {cliente.razaoSocial}
                    {cliente.cnpjCpf && (
                      <span className="ml-1.5 text-xs text-muted">— {cliente.cnpjCpf}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {sucessoCadastroOmie && (
          <div className="rounded-md border border-accent-success/30 bg-accent-success/10 px-3 py-2 text-sm text-accent-success">
            ✓ {sucessoCadastroOmie}
          </div>
        )}

        {clienteOmieId === null &&
          (!cadastroOmieAberto ? (
            <button
              type="button"
              onClick={abrirCadastroOmie}
              disabled={salvando}
              className="self-start rounded-md border border-accent-primary/40 bg-accent-primary/10 px-3 py-1.5 text-xs font-semibold text-accent-primary transition-colors hover:bg-accent-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Cadastrar no Omie
            </button>
          ) : (
            <div className="rounded-md border border-accent-primary/30 bg-accent-primary/10 p-3">
              <p className="text-sm font-medium text-primary">Cadastrar cliente no Omie</p>
              <p className="mt-0.5 text-xs text-muted">
                Revise os dados (pré-preenchidos com o que a Receita Federal retornou, quando
                disponível) antes de confirmar.
              </p>

              {erroCadastroOmie && (
                <div className="mt-2 rounded-md border border-accent-danger/30 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
                  {erroCadastroOmie}
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-muted">Razão social *</label>
                  <input
                    type="text"
                    value={cadastroForm.razaoSocial}
                    onChange={(e) => atualizarCadastroForm('razaoSocial', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                    disabled={cadastrandoOmie}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">Nome fantasia</label>
                  <input
                    type="text"
                    value={cadastroForm.nomeFantasia}
                    onChange={(e) => atualizarCadastroForm('nomeFantasia', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                    disabled={cadastrandoOmie}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">CNPJ *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cadastroForm.cnpj}
                    onChange={(e) => atualizarCadastroForm('cnpj', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 font-mono text-sm"
                    disabled={cadastrandoOmie}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">E-mail (opcional)</label>
                  <input
                    type="email"
                    value={cadastroForm.email}
                    onChange={(e) => atualizarCadastroForm('email', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                    disabled={cadastrandoOmie}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">DDD</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cadastroForm.telefoneDdd}
                    onChange={(e) => atualizarCadastroForm('telefoneDdd', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 font-mono text-sm"
                    disabled={cadastrandoOmie}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">Telefone</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cadastroForm.telefoneNumero}
                    onChange={(e) => atualizarCadastroForm('telefoneNumero', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 font-mono text-sm"
                    disabled={cadastrandoOmie}
                  />
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs text-muted">Logradouro</label>
                  <input
                    type="text"
                    value={cadastroForm.logradouro}
                    onChange={(e) => atualizarCadastroForm('logradouro', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                    disabled={cadastrandoOmie}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">Número</label>
                  <input
                    type="text"
                    value={cadastroForm.enderecoNumero}
                    onChange={(e) => atualizarCadastroForm('enderecoNumero', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                    disabled={cadastrandoOmie}
                  />
                </div>
              </div>

              <div className="mt-2 grid grid-cols-4 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs text-muted">Bairro</label>
                  <input
                    type="text"
                    value={cadastroForm.bairro}
                    onChange={(e) => atualizarCadastroForm('bairro', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                    disabled={cadastrandoOmie}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">Cidade</label>
                  <input
                    type="text"
                    value={cadastroForm.cidade}
                    onChange={(e) => atualizarCadastroForm('cidade', e.target.value)}
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                    disabled={cadastrandoOmie}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={cadastroForm.estado}
                    onChange={(e) => atualizarCadastroForm('estado', e.target.value.toUpperCase())}
                    className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm uppercase"
                    disabled={cadastrandoOmie}
                  />
                </div>
              </div>

              <div className="mt-2 w-1/4 min-w-[110px]">
                <label className="block text-xs text-muted">CEP</label>
                <input
                  type="text"
                  value={cadastroForm.cep}
                  onChange={(e) => atualizarCadastroForm('cep', e.target.value)}
                  className="input-field mt-1 w-full rounded-md px-2 py-1.5 font-mono text-sm"
                  disabled={cadastrandoOmie}
                />
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={confirmarCadastroOmie}
                  disabled={cadastrandoOmie}
                  className="rounded-md bg-accent-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {cadastrandoOmie ? 'Cadastrando…' : 'Confirmar cadastro'}
                </button>
                <button
                  type="button"
                  onClick={() => setCadastroOmieAberto(false)}
                  disabled={cadastrandoOmie}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ))}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-primary/80">
              Telefone do cliente (opcional)
            </label>
            <input
              type="tel"
              value={clienteTelefone}
              onChange={(e) => setClienteTelefone(formatarTelefoneInput(e.target.value))}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              placeholder="(11) 91234-5678"
              disabled={salvando}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-primary/80">
              Nome do contato (opcional)
            </label>
            <input
              type="text"
              value={clienteContato}
              onChange={(e) => setClienteContato(e.target.value)}
              className="input-field mt-1 w-full rounded-md px-3 py-2 text-sm"
              placeholder="Ex: Maria Compras"
              disabled={salvando}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-primary/80">Itens</span>
            <button
              type="button"
              onClick={adicionarItem}
              disabled={salvando}
              className="text-sm font-medium text-accent-compras hover:text-primary"
            >
              + Adicionar item
            </button>
          </div>

          <div className="mt-2 flex flex-col gap-3">
            {itens.map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-2 rounded-md border border-white/10 bg-surface-alt p-3"
              >
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <div className="min-w-[130px] flex-1">
                      <label className="block text-xs text-muted">Código (opcional)</label>
                      <div className="relative mt-1">
                        <input
                          type="text"
                          value={item.codigo}
                          onChange={(e) => atualizarCodigo(index, e.target.value)}
                          onBlur={() => handleBlurCodigo(index)}
                          className="input-field w-full rounded-md px-2 py-1.5 pr-7 font-mono text-sm"
                          disabled={salvando}
                        />
                        {item.statusCodigo === 'buscando' && (
                          <span
                            aria-hidden="true"
                            className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin rounded-full border-2 border-white/20 border-t-accent-primary"
                          />
                        )}
                        {item.statusCodigo === 'encontrado' && (
                          <span
                            aria-hidden="true"
                            title="Produto encontrado no Omie"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-sm font-bold text-accent-success"
                          >
                            ✓
                          </span>
                        )}
                      </div>
                      {item.statusCodigo === 'nao_encontrado' && (
                        <p className="mt-1 text-[11px] text-muted">
                          Código não encontrado no Omie.
                        </p>
                      )}
                      {item.statusCodigo === 'erro' && (
                        <p className="mt-1 text-[11px] text-accent-danger">
                          Não foi possível consultar o Omie agora.
                        </p>
                      )}
                    </div>
                    <div className="min-w-[220px] flex-[2]">
                      <label className="block text-xs text-muted">Descrição *</label>
                      <input
                        type="text"
                        value={item.descricao}
                        onChange={(e) =>
                          atualizarItem(index, 'descricao', e.target.value)
                        }
                        className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                        disabled={salvando}
                      />
                    </div>
                    <div className="min-w-[80px] flex-1">
                      <label className="block text-xs text-muted">Qtd. *</label>
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={item.quantidade}
                        onChange={(e) =>
                          atualizarItem(index, 'quantidade', e.target.value)
                        }
                        className="input-field mt-1 w-full rounded-md px-2 py-1.5 font-mono text-sm"
                        disabled={salvando}
                      />
                    </div>
                    <div className="min-w-[140px] flex-1">
                      <label className="block text-xs text-muted">CA (opcional)</label>
                      <input
                        type="text"
                        value={item.ca}
                        onChange={(e) => atualizarItem(index, 'ca', e.target.value)}
                        className="input-field mt-1 w-full rounded-md px-2 py-1.5 font-mono text-sm"
                        disabled={salvando}
                      />
                    </div>
                    {(orcamentoDireto || item.emEstoque) && (
                      <div className="min-w-[120px] flex-1">
                        <label className="block text-xs text-accent-compras">
                          Preço de venda{orcamentoDireto ? ' *' : ''}
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={item.precoVenda}
                          onChange={(e) => atualizarItem(index, 'precoVenda', e.target.value)}
                          className="input-field mt-1 w-full rounded-md border-accent-compras/40 px-2 py-1.5 font-mono text-sm"
                          disabled={salvando}
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-muted">Tamanho (opcional)</label>
                      <input
                        type="text"
                        value={item.tamanho}
                        onChange={(e) => atualizarItem(index, 'tamanho', e.target.value)}
                        className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                        disabled={salvando}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted">Número (opcional)</label>
                      <input
                        type="text"
                        value={item.numero}
                        onChange={(e) => atualizarItem(index, 'numero', e.target.value)}
                        className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                        disabled={salvando}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted">Cor (opcional)</label>
                      <input
                        type="text"
                        value={item.cor}
                        onChange={(e) => atualizarItem(index, 'cor', e.target.value)}
                        className="input-field mt-1 w-full rounded-md px-2 py-1.5 text-sm"
                        disabled={salvando}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-muted">Observação (opcional)</label>
                    <textarea
                      value={item.observacao}
                      onChange={(e) => atualizarItem(index, 'observacao', e.target.value)}
                      rows={2}
                      className="input-field mt-1 w-full resize-none rounded-md px-2 py-1.5 text-sm"
                      disabled={salvando}
                    />
                  </div>

                  <label className="flex w-fit cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.emEstoque}
                      onChange={(e) => alternarEmEstoque(index, e.target.checked)}
                      disabled={salvando}
                      className="h-4 w-4 accent-accent-compras"
                    />
                    <span className="text-xs text-muted">
                      Já em estoque (não precisa cotar)
                    </span>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => removerItem(index)}
                  disabled={salvando || itens.length === 1}
                  title={
                    itens.length === 1
                      ? 'É necessário ao menos 1 item'
                      : 'Remover item'
                  }
                  className="mt-1 rounded-md p-1.5 text-muted hover:bg-white/10 hover:text-accent-danger disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {erro && (
          <div className="rounded-md border border-accent-danger/30 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
            {erro}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={fechar}
            disabled={salvando}
            className="rounded-md border border-white/15 px-4 py-2 text-sm text-primary/80 hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando || !empresaAtiva}
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-primary-dark disabled:opacity-50"
          >
            {salvando ? 'Criando…' : 'Criar Orçamento'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
