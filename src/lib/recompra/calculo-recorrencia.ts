// ===============================================
// MOTOR DE RECOMPRA PREDITIVA — RHOCAL
// Função de cálculo de recorrência (v1 / MVP)
// ===============================================

export interface Pedido {
  data: Date;
  quantidade: number;
}

export interface PrevisaoRecompra {
  temHistoricoSuficiente: boolean;
  origemCalculo: "historico" | "fallback_categoria";
  intervaloMedioDias: number | null;
  consumoDiario: number | null;
  dataUltimaCompra: Date;
  quantidadeUltimaCompra: number;
  diasAtePrecisar: number;
  dataPrevistaRecompra: Date;
  confiabilidade: "alta" | "media" | "baixa";
}

const FALLBACK_DIAS_POR_CATEGORIA: Record<string, number> = {
  epi_consumo_rapido: 30,
  epi_consumo_medio: 60,
  ferramenta: 180,
  default: 45,
};

function diasEntre(a: Date, b: Date): number {
  return Math.abs((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function media(nums: number[]): number {
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function desvioPadrao(nums: number[], m: number): number {
  if (nums.length < 2) return 0;
  const variancia = media(nums.map((n) => (n - m) ** 2));
  return Math.sqrt(variancia);
}

export function calcularRecorrencia(
  pedidos: Pedido[],
  categoria: string = "default"
): PrevisaoRecompra {
  if (pedidos.length === 0) {
    throw new Error("Não é possível calcular sem nenhum pedido.");
  }

  const ordenados = [...pedidos].sort((a, b) => a.data.getTime() - b.data.getTime());
  const ultimo = ordenados[ordenados.length - 1];

  if (ordenados.length < 2) {
    const diasFallback =
      FALLBACK_DIAS_POR_CATEGORIA[categoria] ?? FALLBACK_DIAS_POR_CATEGORIA.default;

    const dataPrevista = new Date(ultimo.data);
    dataPrevista.setDate(dataPrevista.getDate() + diasFallback);

    return {
      temHistoricoSuficiente: false,
      origemCalculo: "fallback_categoria",
      intervaloMedioDias: null,
      consumoDiario: null,
      dataUltimaCompra: ultimo.data,
      quantidadeUltimaCompra: ultimo.quantidade,
      diasAtePrecisar: diasFallback,
      dataPrevistaRecompra: dataPrevista,
      confiabilidade: "baixa",
    };
  }

  const intervalos: number[] = [];
  for (let i = 1; i < ordenados.length; i++) {
    intervalos.push(diasEntre(ordenados[i - 1].data, ordenados[i].data));
  }

  const intervaloMedio = media(intervalos);

  const quantidadeTotal = ordenados.reduce((s, p) => s + p.quantidade, 0);
  const periodoTotalDias = diasEntre(ordenados[0].data, ultimo.data);
  const consumoDiario = periodoTotalDias > 0 ? quantidadeTotal / periodoTotalDias : quantidadeTotal;

  const diasAtePrecisar = consumoDiario > 0 ? ultimo.quantidade / consumoDiario : intervaloMedio;

  const dataPrevista = new Date(ultimo.data);
  dataPrevista.setDate(dataPrevista.getDate() + Math.round(diasAtePrecisar));

  const desvio = desvioPadrao(intervalos, intervaloMedio);
  const coeficienteVariacao = intervaloMedio > 0 ? desvio / intervaloMedio : 1;

  let confiabilidade: "alta" | "media" | "baixa" = "alta";
  if (ordenados.length < 3) confiabilidade = "media";
  if (coeficienteVariacao > 0.5) confiabilidade = "baixa";

  return {
    temHistoricoSuficiente: true,
    origemCalculo: "historico",
    intervaloMedioDias: Math.round(intervaloMedio),
    consumoDiario: Number(consumoDiario.toFixed(3)),
    dataUltimaCompra: ultimo.data,
    quantidadeUltimaCompra: ultimo.quantidade,
    diasAtePrecisar: Math.round(diasAtePrecisar),
    dataPrevistaRecompra: dataPrevista,
    confiabilidade,
  };
}
