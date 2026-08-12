import type { TemperaturaAutomatica } from './agregar'

// Reaproveita as cores funcionais já existentes no design system (verde de
// sucesso, âmbar de alerta, vermelho de erro) em vez de inventar uma paleta
// nova — "cinza" é o único caso sem token de marca, cai pro neutro padrão.
export const TEMPERATURA_AUTOMATICA_BADGE_CLASSES: Record<TemperaturaAutomatica, string> = {
  verde: 'bg-accent-success/15 text-accent-success border-accent-success/30',
  amarelo: 'bg-accent-alert/15 text-accent-alert border-accent-alert/30',
  vermelho: 'bg-accent-danger/15 text-accent-danger border-accent-danger/30',
  cinza: 'bg-white/10 text-muted border-white/15',
}

export const TEMPERATURA_AUTOMATICA_DOT_VAR: Record<TemperaturaAutomatica, string> = {
  verde: '--accent-success',
  amarelo: '--accent-alert',
  vermelho: '--accent-danger',
  cinza: '--text-muted',
}
