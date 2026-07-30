import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { formatarMoeda } from '@/lib/kanban/formatacao'
import type { Database } from '@/types/database'

type Pedido = Database['public']['Tables']['pedidos']['Row']
type PedidoItem = Database['public']['Tables']['pedido_itens']['Row']
type Empresa = Database['public']['Tables']['empresas']['Row']

// Fallback usado só se a empresa dona do pedido não puder ser carregada (ex:
// pedido antigo sem empresa_id ainda migrado) — nunca deixa o PDF quebrar.
export const EMPRESA_PDF_PADRAO: Pick<
  Empresa,
  'razao_social' | 'cnpj' | 'ie' | 'endereco' | 'telefone' | 'logo_path' | 'cor_primaria' | 'cor_secundaria'
> = {
  razao_social: 'RHOCAL EQUIPAMENTOS DE SEGURANÇA LTDA',
  cnpj: '53.263.859/0001-50',
  ie: '206.912.722.113',
  endereco: 'Av. Capitão Francisco César, 842 — Vila Pindorama, Barueri-SP — CEP: 06415-000',
  telefone: '(11) 4161-6675',
  logo_path: '/rhocal-logo.png',
  cor_primaria: '#F1592A',
  cor_secundaria: null,
}

// corTexto: cor de textos/título/valores em destaque — precisa de bom
// contraste sobre fundo branco, por isso usa a cor SECUNDÁRIA da empresa
// quando existe (ex: preto da MATSEG sobre o amarelo da marca, que teria
// contraste ruim como cor de texto) e só cai pra primária quando não há
// secundária (caso da RHOCAL, mantendo o visual já existente sem mudança).
// corLinha: cor decorativa de divisórias/bordas — sempre a cor primária da
// marca, já que ali o requisito é identidade visual, não legibilidade de texto.
function criarStyles(corTexto: string, corLinha: string) {
  return StyleSheet.create({
    page: {
      padding: 40,
      fontSize: 10,
      fontFamily: 'Helvetica',
      color: '#1a1a1a',
      backgroundColor: '#ffffff',
    },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    logo: { width: 54, height: 54, marginRight: 12 },
    empresaBloco: { flex: 1 },
    empresaNome: { fontSize: 11.5, fontFamily: 'Helvetica-Bold', color: corTexto },
    empresaLinha: { fontSize: 8.5, color: '#444444', marginTop: 1.5 },
    orcamentoBloco: { alignItems: 'flex-end' },
    tituloOrcamento: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: corTexto },
    emissao: { fontSize: 8.5, color: '#666666', marginTop: 3 },
    divisoria: { borderBottomWidth: 1.5, borderBottomColor: corLinha, marginTop: 14, marginBottom: 14 },
    divisoriaFina: { borderBottomWidth: 0.75, borderBottomColor: '#e2c3b8', marginTop: 10, marginBottom: 10 },
    secaoTitulo: {
      fontSize: 9,
      fontFamily: 'Helvetica-Bold',
      color: corTexto,
      marginBottom: 5,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    clienteGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    clienteCampo: { width: '50%', marginBottom: 5 },
    clienteLabel: { fontSize: 7.5, color: '#888888' },
    clienteValor: { fontSize: 9.5, marginTop: 1 },
    tabelaHeader: {
      flexDirection: 'row',
      backgroundColor: corTexto,
      paddingVertical: 5,
      paddingHorizontal: 4,
    },
    tabelaHeaderTexto: { color: '#ffffff', fontSize: 8, fontFamily: 'Helvetica-Bold' },
    tabelaRow: {
      flexDirection: 'row',
      paddingVertical: 5,
      paddingHorizontal: 4,
      borderBottomWidth: 0.5,
      borderBottomColor: '#dddddd',
    },
    tabelaRowAlt: { backgroundColor: '#faf5f3' },
    celTexto: { fontSize: 8.5 },
    colDescricao: { flex: 3 },
    colCa: { flex: 1 },
    colDetalhes: { flex: 1.5 },
    colQtd: { flex: 0.7, textAlign: 'right' },
    colUnit: { flex: 1.1, textAlign: 'right' },
    colSubtotal: { flex: 1.1, textAlign: 'right' },
    observacaoLinha: {
      paddingHorizontal: 4,
      paddingBottom: 5,
      borderBottomWidth: 0.5,
      borderBottomColor: '#dddddd',
    },
    observacaoTexto: { fontSize: 7.5, color: '#666666', fontFamily: 'Helvetica-Oblique' },
    freteLinha: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 8,
      paddingHorizontal: 4,
    },
    freteLabel: { fontSize: 9, marginRight: 10, color: '#444444' },
    freteValor: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
    totalBloco: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'baseline',
      marginTop: 6,
      paddingTop: 8,
      paddingHorizontal: 4,
      borderTopWidth: 1.5,
      borderTopColor: corLinha,
    },
    totalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginRight: 10, color: '#1a1a1a' },
    totalValor: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: corTexto },
    faturamentoBox: {
      marginTop: 16,
      padding: 9,
      borderWidth: 1,
      borderColor: corLinha,
      borderRadius: 3,
    },
    faturamentoTexto: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: corTexto, textAlign: 'center' },
    rodape: { marginTop: 28, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: '#cccccc' },
    rodapeLinha: { fontSize: 8.5, color: '#555555', marginBottom: 2 },
    rodapeValidade: { fontSize: 8.5, color: '#555555', fontFamily: 'Helvetica-Oblique', marginTop: 5 },
  })
}

function combinarDetalhes(item: PedidoItem): string {
  return [
    item.tamanho?.trim() ? `Tam. ${item.tamanho.trim()}` : null,
    item.numero?.trim() ? `Nº ${item.numero.trim()}` : null,
    item.cor?.trim() ? `Cor ${item.cor.trim()}` : null,
  ]
    .filter((detalhe): detalhe is string => detalhe !== null)
    .join(' · ')
}

function formatarDataHora(data: Date): string {
  const dataStr = data.toLocaleDateString('pt-BR')
  const horaStr = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${dataStr} às ${horaStr}`
}

type EmpresaPdfDados = Pick<
  Empresa,
  'razao_social' | 'cnpj' | 'ie' | 'endereco' | 'telefone' | 'logo_path' | 'cor_primaria' | 'cor_secundaria'
>

export function OrcamentoPdfDocument({
  pedido,
  itens,
  nomeVendedor,
  dataEmissao,
  empresa = EMPRESA_PDF_PADRAO,
}: {
  pedido: Pedido
  itens: PedidoItem[]
  nomeVendedor: string | null
  dataEmissao: Date
  empresa?: EmpresaPdfDados
}) {
  // preco_venda é o preço UNITÁRIO do item — precisa multiplicar pela
  // quantidade, igual ao Subtotal calculado por linha logo abaixo.
  const totalItens = itens.reduce(
    (soma, item) => soma + Number(item.preco_venda ?? 0) * Number(item.quantidade),
    0,
  )
  const frete = Number(pedido.valor_frete ?? 0)
  const totalGeral = totalItens + frete
  const styles = criarStyles(empresa.cor_secundaria || empresa.cor_primaria, empresa.cor_primaria)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, não <img> do HTML */}
          <Image style={styles.logo} src={empresa.logo_path} />
          <View style={styles.empresaBloco}>
            <Text style={styles.empresaNome}>{empresa.razao_social}</Text>
            <Text style={styles.empresaLinha}>
              CNPJ: {empresa.cnpj}
              {empresa.ie ? ` · IE: ${empresa.ie}` : ''}
            </Text>
            <Text style={styles.empresaLinha}>{empresa.endereco}</Text>
            <Text style={styles.empresaLinha}>Telefone: {empresa.telefone}</Text>
          </View>
          <View style={styles.orcamentoBloco}>
            <Text style={styles.tituloOrcamento}>Orçamento Nº {pedido.numero}</Text>
            <Text style={styles.emissao}>Emitido em {formatarDataHora(dataEmissao)}</Text>
          </View>
        </View>

        <View style={styles.divisoria} />

        <Text style={styles.secaoTitulo}>Dados do cliente</Text>
        <View style={styles.clienteGrid}>
          <View style={styles.clienteCampo}>
            <Text style={styles.clienteLabel}>Cliente</Text>
            <Text style={styles.clienteValor}>{pedido.cliente_nome}</Text>
          </View>
          <View style={styles.clienteCampo}>
            <Text style={styles.clienteLabel}>CNPJ</Text>
            <Text style={styles.clienteValor}>{pedido.cliente_cnpj || '—'}</Text>
          </View>
          <View style={styles.clienteCampo}>
            <Text style={styles.clienteLabel}>Telefone</Text>
            <Text style={styles.clienteValor}>{pedido.cliente_telefone || '—'}</Text>
          </View>
          <View style={styles.clienteCampo}>
            <Text style={styles.clienteLabel}>Contato</Text>
            <Text style={styles.clienteValor}>{pedido.cliente_contato || '—'}</Text>
          </View>
        </View>

        <View style={styles.divisoriaFina} />

        <Text style={styles.secaoTitulo}>Itens</Text>
        <View style={styles.tabelaHeader}>
          <Text style={[styles.tabelaHeaderTexto, styles.colDescricao]}>Descrição</Text>
          <Text style={[styles.tabelaHeaderTexto, styles.colCa]}>CA</Text>
          <Text style={[styles.tabelaHeaderTexto, styles.colDetalhes]}>Tam./Nº/Cor</Text>
          <Text style={[styles.tabelaHeaderTexto, styles.colQtd]}>Qtd.</Text>
          <Text style={[styles.tabelaHeaderTexto, styles.colUnit]}>Preço unit.</Text>
          <Text style={[styles.tabelaHeaderTexto, styles.colSubtotal]}>Subtotal</Text>
        </View>
        {itens.map((item, index) => {
          const precoUnit = Number(item.preco_venda ?? 0)
          const subtotal = precoUnit * Number(item.quantidade)
          const observacao = item.observacao?.trim()
          const estiloAlt = index % 2 === 1 ? styles.tabelaRowAlt : {}
          return (
            <View key={item.id}>
              <View
                style={[
                  styles.tabelaRow,
                  estiloAlt,
                  observacao ? { borderBottomWidth: 0 } : {},
                ]}
              >
                <Text style={[styles.celTexto, styles.colDescricao]}>{item.descricao}</Text>
                <Text style={[styles.celTexto, styles.colCa]}>{item.ca || '—'}</Text>
                <Text style={[styles.celTexto, styles.colDetalhes]}>
                  {combinarDetalhes(item) || '—'}
                </Text>
                <Text style={[styles.celTexto, styles.colQtd]}>{item.quantidade}</Text>
                <Text style={[styles.celTexto, styles.colUnit]}>{formatarMoeda(precoUnit)}</Text>
                <Text style={[styles.celTexto, styles.colSubtotal]}>{formatarMoeda(subtotal)}</Text>
              </View>
              {observacao && (
                <View style={[styles.observacaoLinha, estiloAlt]}>
                  <Text style={styles.observacaoTexto}>Obs.: {observacao}</Text>
                </View>
              )}
            </View>
          )
        })}

        {frete > 0 && (
          <View style={styles.freteLinha}>
            <Text style={styles.freteLabel}>Frete</Text>
            <Text style={styles.freteValor}>{formatarMoeda(frete)}</Text>
          </View>
        )}

        <View style={styles.totalBloco}>
          <Text style={styles.totalLabel}>Total geral</Text>
          <Text style={styles.totalValor}>{formatarMoeda(totalGeral)}</Text>
        </View>

        {pedido.modo_faturamento && (
          <View style={styles.faturamentoBox}>
            <Text style={styles.faturamentoTexto}>
              Condição de pagamento: {pedido.modo_faturamento}
            </Text>
          </View>
        )}

        <View style={styles.rodape}>
          <Text style={styles.rodapeLinha}>Vendedor responsável: {nomeVendedor ?? '—'}</Text>
          <Text style={styles.rodapeLinha}>Documento emitido em {formatarDataHora(dataEmissao)}</Text>
          <Text style={styles.rodapeValidade}>
            Orçamento válido por 7 dias a partir da data de emissão.
          </Text>
        </View>
      </Page>
    </Document>
  )
}
