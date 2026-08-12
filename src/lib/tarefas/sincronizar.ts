// Dispara a sincronização best-effort com o Omie depois de criar/editar uma
// tarefa (fase 33) — fire-and-forget: nunca é aguardado de um jeito que
// bloqueie a UI, e falhas já são tratadas (e logadas em error_log) dentro da
// própria rota. Chamar sempre que uma tarefa é inserida ou tem
// situacao/importante/urgente/data_prevista/descricao alterados.
export function sincronizarTarefaComOmie(tarefaId: string) {
  fetch('/api/omie/sincronizar-tarefa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tarefaId }),
  }).catch(() => {
    // Melhor esforço: falha de rede aqui não deve incomodar o usuário —
    // a rota já loga falhas de API do Omie em error_log.
  })
}
