import type { MatchSnapshot } from '../core/MatchStateManager'

/**
 * HUD de marcador estilo transmisión ATP (Fase 4). No crea geometría 3D: enlaza
 * directamente a los nodos del scoreboard en index.html y un banner de anuncios
 * (FAULT / OUT / NET / WINNER / fin de partido). Solo toca el DOM cuando algo
 * cambia respecto al frame anterior, para no ensuciar el layout cada tick.
 */
export class MatchHUD {
  private readonly p1Name = byId('p1-name')
  private readonly p2Name = byId('p2-name')
  private readonly p1Pts = byId('p1-pts')
  private readonly p2Pts = byId('p2-pts')
  private readonly p1Games = byId('p1-games')
  private readonly p2Games = byId('p2-games')
  private readonly p1Sets = byId('p1-sets')
  private readonly p2Sets = byId('p2-sets')
  private readonly serve1 = byId('serve-p1')
  private readonly serve2 = byId('serve-p2')
  private readonly announce = byId('announce')

  private lastAnnounce = ''

  /** Refresca todos los campos del marcador desde el snapshot del partido. */
  update(s: MatchSnapshot): void {
    const [a, b] = s.sides

    setText(this.p1Name, a.name)
    setText(this.p2Name, b.name)
    setText(this.p1Pts, a.point)
    setText(this.p2Pts, b.point)
    setText(this.p1Games, String(a.games))
    setText(this.p2Games, String(b.games))
    setText(this.p1Sets, String(a.sets))
    setText(this.p2Sets, String(b.sets))

    this.serve1.classList.toggle('hidden', !a.serving)
    this.serve2.classList.toggle('hidden', !b.serving)

    this.renderAnnouncement(s)
  }

  private renderAnnouncement(s: MatchSnapshot): void {
    let text = ''
    if (s.matchOver && s.winnerName) {
      text = `${s.winnerName} wins`
    } else if (s.state === 'POINT_SCORED') {
      text = s.announcement
    } else if (s.state === 'SERVICE_READY') {
      text = ''  // limpia entre puntos al preparar el saque
    }

    if (text === this.lastAnnounce) return
    this.lastAnnounce = text

    setText(this.announce, text)
    this.announce.classList.toggle('show', text !== '')
  }
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`MatchHUD: missing element #${id}`)
  return el
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text
}
