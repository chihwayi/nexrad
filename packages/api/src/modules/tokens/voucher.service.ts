import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import type { Token } from './token.service.js'

export interface VoucherOptions {
  tokens: Token[]
  orgName: string
  orgFooter?: string
  showPrice: boolean
  currency: string
}

/**
 * Generate a printable voucher sheet PDF.
 * Layout: 2 columns × 5 rows = 10 vouchers per A4 page.
 */
export async function generateVoucherPdf(opts: VoucherOptions): Promise<Uint8Array> {
  const { tokens, orgName, orgFooter, showPrice, currency } = opts
  const pdfDoc = await PDFDocument.create()
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)

  const A4_WIDTH = 595.28
  const A4_HEIGHT = 841.89
  const COLS = 2
  const ROWS = 5
  const PER_PAGE = COLS * ROWS
  const MARGIN = 20
  const CARD_W = (A4_WIDTH - MARGIN * 3) / COLS
  const CARD_H = (A4_HEIGHT - MARGIN * (ROWS + 1)) / ROWS
  const GUTTER = MARGIN

  const pages = Math.ceil(tokens.length / PER_PAGE)

  for (let p = 0; p < pages; p++) {
    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT])
    const batch = tokens.slice(p * PER_PAGE, (p + 1) * PER_PAGE)

    batch.forEach((token, idx) => {
      const col = idx % COLS
      const row = Math.floor(idx / COLS)
      const x = MARGIN + col * (CARD_W + GUTTER)
      const y = A4_HEIGHT - MARGIN - (row + 1) * CARD_H - row * GUTTER

      // Card border
      page.drawRectangle({
        x,
        y,
        width: CARD_W,
        height: CARD_H,
        borderColor: rgb(0.8, 0.8, 0.8),
        borderWidth: 0.5,
        color: rgb(0.99, 0.99, 0.99),
      })

      // Accent bar at top of card
      page.drawRectangle({
        x,
        y: y + CARD_H - 16,
        width: CARD_W,
        height: 16,
        color: rgb(0.25, 0.32, 0.71), // indigo-600
      })

      // Org name in accent bar
      page.drawText(orgName.toUpperCase(), {
        x: x + 6,
        y: y + CARD_H - 11,
        size: 7,
        font: boldFont,
        color: rgb(1, 1, 1),
      })

      // Plan name
      const planLabel = token.planName ?? 'Voucher'
      page.drawText(planLabel, {
        x: x + 6,
        y: y + CARD_H - 32,
        size: 9,
        font: boldFont,
        color: rgb(0.2, 0.2, 0.2),
      })

      // Price
      if (showPrice && token.planCost != null) {
        page.drawText(`${currency} ${Number(token.planCost).toFixed(2)}`, {
          x: x + CARD_W - 60,
          y: y + CARD_H - 32,
          size: 10,
          font: boldFont,
          color: rgb(0.15, 0.55, 0.15),
        })
      }

      // Divider line
      page.drawLine({
        start: { x: x + 6, y: y + CARD_H - 40 },
        end: { x: x + CARD_W - 6, y: y + CARD_H - 40 },
        thickness: 0.3,
        color: rgb(0.85, 0.85, 0.85),
      })

      // "USERNAME" label
      page.drawText('USERNAME', {
        x: x + 6,
        y: y + CARD_H - 55,
        size: 6,
        font: regularFont,
        color: rgb(0.5, 0.5, 0.5),
      })

      // Token username — large and prominent
      page.drawText(token.username, {
        x: x + 6,
        y: y + CARD_H - 70,
        size: 14,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
      })

      // "PASSWORD" label (same as username for voucher tokens)
      page.drawText('PASSWORD', {
        x: x + 6,
        y: y + CARD_H - 85,
        size: 6,
        font: regularFont,
        color: rgb(0.5, 0.5, 0.5),
      })

      page.drawText(token.username, {
        x: x + 6,
        y: y + CARD_H - 98,
        size: 12,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
      })

      // Expiry
      if (token.expiresAt) {
        page.drawText(`Expires: ${new Date(token.expiresAt).toLocaleDateString()}`, {
          x: x + 6,
          y: y + 10,
          size: 6,
          font: regularFont,
          color: rgb(0.5, 0.5, 0.5),
        })
      }

      // Footer
      if (orgFooter) {
        page.drawText(orgFooter, {
          x: x + 6,
          y: y + 3,
          size: 5,
          font: regularFont,
          color: rgb(0.6, 0.6, 0.6),
        })
      }
    })
  }

  return pdfDoc.save()
}
