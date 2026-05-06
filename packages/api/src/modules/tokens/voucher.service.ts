import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { Token } from './token.service.js'

export interface VoucherOptions {
  tokens: Token[]
  orgName: string
  orgFooter?: string
  showPrice: boolean
  currency: string
}

// 6 cols × 10 rows = 60 vouchers per A4 page (industry-standard hotspot card density)
export async function generateVoucherPdf(opts: VoucherOptions): Promise<Uint8Array> {
  const { tokens, orgName, orgFooter, showPrice, currency } = opts
  const pdfDoc = await PDFDocument.create()
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const monoBold = await pdfDoc.embedFont(StandardFonts.CourierBold)

  const A4_W = 595.28
  const A4_H = 841.89
  const COLS = 6
  const ROWS = 10
  const PER_PAGE = COLS * ROWS
  const MARGIN = 12
  const GX = 2 // horizontal gutter
  const GY = 2 // vertical gutter

  const CARD_W = (A4_W - MARGIN * 2 - GX * (COLS - 1)) / COLS // ≈ 93.5 pt
  const CARD_H = (A4_H - MARGIN * 2 - GY * (ROWS - 1)) / ROWS // ≈ 80 pt
  const HEADER_H = 8
  const PAD = 2.5

  const orgLabel = orgName.toUpperCase().slice(0, 15)

  for (let p = 0; p < Math.ceil(tokens.length / PER_PAGE); p++) {
    const page = pdfDoc.addPage([A4_W, A4_H])
    const batch = tokens.slice(p * PER_PAGE, (p + 1) * PER_PAGE)

    batch.forEach((token, idx) => {
      const col = idx % COLS
      const row = Math.floor(idx / COLS)
      const cx = MARGIN + col * (CARD_W + GX)
      const cy = A4_H - MARGIN - (row + 1) * CARD_H - row * GY

      // Card border (thin solid — pdf-lib has no native dashed support)
      page.drawRectangle({
        x: cx,
        y: cy,
        width: CARD_W,
        height: CARD_H,
        borderColor: rgb(0.55, 0.55, 0.55),
        borderWidth: 0.4,
        color: rgb(1, 1, 1),
      })

      // Indigo header band
      page.drawRectangle({
        x: cx,
        y: cy + CARD_H - HEADER_H,
        width: CARD_W,
        height: HEADER_H,
        color: rgb(0.24, 0.31, 0.71),
      })

      // Org name in band
      page.drawText(orgLabel, {
        x: cx + PAD,
        y: cy + CARD_H - HEADER_H + 2,
        size: 4.5,
        font: boldFont,
        color: rgb(1, 1, 1),
      })

      // "WiFi" tag right-aligned in band
      page.drawText('WiFi', {
        x: cx + CARD_W - 13,
        y: cy + CARD_H - HEADER_H + 2,
        size: 4.5,
        font: boldFont,
        color: rgb(0.8, 0.87, 1),
      })

      // Content starts just below band
      let y = cy + CARD_H - HEADER_H - 4

      // "User" label
      page.drawText('User', {
        x: cx + PAD,
        y,
        size: 4,
        font: regularFont,
        color: rgb(0.55, 0.55, 0.55),
      })
      y -= 8

      // Username (mono bold, prominent)
      page.drawText(token.username.slice(0, 15), {
        x: cx + PAD,
        y,
        size: 7,
        font: monoBold,
        color: rgb(0.05, 0.05, 0.05),
      })
      y -= 3

      // Thin rule
      page.drawLine({
        start: { x: cx + PAD, y },
        end: { x: cx + CARD_W - PAD, y },
        thickness: 0.2,
        color: rgb(0.82, 0.82, 0.82),
      })
      y -= 5

      // "Pass" label
      page.drawText('Pass', {
        x: cx + PAD,
        y,
        size: 4,
        font: regularFont,
        color: rgb(0.55, 0.55, 0.55),
      })
      y -= 8

      // Password (same as username for hotspot tokens)
      page.drawText(token.username.slice(0, 15), {
        x: cx + PAD,
        y,
        size: 7,
        font: monoBold,
        color: rgb(0.05, 0.05, 0.05),
      })
      y -= 4

      // Thin rule
      page.drawLine({
        start: { x: cx + PAD, y },
        end: { x: cx + CARD_W - PAD, y },
        thickness: 0.2,
        color: rgb(0.88, 0.88, 0.88),
      })
      y -= 5

      // Plan name
      const planLabel = (token.planName ?? 'Token').slice(0, 14)
      page.drawText(planLabel, {
        x: cx + PAD,
        y,
        size: 4,
        font: regularFont,
        color: rgb(0.4, 0.4, 0.4),
      })

      // Price right-aligned on same row
      if (showPrice && token.planCost != null) {
        const price = `${currency}${Number(token.planCost).toFixed(2)}`
        page.drawText(price, {
          x: cx + CARD_W - PAD - price.length * 2.7,
          y,
          size: 4,
          font: boldFont,
          color: rgb(0.1, 0.45, 0.1),
        })
      }

      // Footer text
      if (orgFooter) {
        page.drawText(orgFooter.slice(0, 20), {
          x: cx + PAD,
          y: cy + 1.5,
          size: 3,
          font: regularFont,
          color: rgb(0.65, 0.65, 0.65),
        })
      }
    })
  }

  return pdfDoc.save()
}
