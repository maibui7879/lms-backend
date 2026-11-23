import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { Certificate } from '../entities/certificate.entity';

const regularFont =
  '@expo-google-fonts/be-vietnam-pro/400Regular/BeVietnamPro_400Regular.ttf';
const boldFont =
  '@expo-google-fonts/be-vietnam-pro/700Bold/BeVietnamPro_700Bold.ttf';
const ink = '#173343';
const gold = '#93702C';

export async function renderCertificatePdf(
  certificate: Pick<
    Certificate,
    'courseTitle' | 'issuedAt' | 'contentVersion' | 'verificationCode'
  >,
  recipientName: string,
  verificationUrl: string,
): Promise<Buffer> {
  const page = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    info: { Title: 'Chứng chỉ hoàn thành khóa học', Author: 'LMS' },
  });
  const { width, height } = page.page;
  page.registerFont('regular', require.resolve(regularFont));
  page.registerFont('bold', require.resolve(boldFont));
  page.rect(0, 0, width, height).fill('#FAF7EE');
  page
    .rect(25, 25, width - 50, height - 50)
    .lineWidth(2)
    .stroke(ink);
  page
    .rect(32, 32, width - 64, height - 64)
    .lineWidth(0.75)
    .stroke(gold);

  const center = { align: 'center' as const, width: width - 160 };
  page.fillColor(gold).font('bold').fontSize(14).text('LMS', 80, 63, center);
  page
    .fillColor(ink)
    .fontSize(34)
    .text('CHỨNG CHỈ HOÀN THÀNH', 80, 101, center);
  page
    .moveTo(width / 2 - 35, 167)
    .lineTo(width / 2 + 35, 167)
    .stroke(gold);
  page
    .font('regular')
    .fontSize(13)
    .text('Trân trọng trao cho', 80, 184, center);
  centeredText(page, recipientName, 213, 80, 40);
  page
    .font('regular')
    .fontSize(13)
    .text('đã hoàn thành khóa học', 80, 304, center);
  centeredText(
    page,
    certificate.courseTitle.normalize('NFC').replace(/\s+/g, ' ').trim(),
    334,
    74,
    24,
  );

  const date = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'long',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(certificate.issuedAt);
  page
    .moveTo(76, 427)
    .lineTo(width - 76, 427)
    .stroke(gold);
  page.font('regular').fontSize(12).text(`Ngày cấp ${date}`, 76, 449);
  page.text(`Phiên bản khóa học ${certificate.contentVersion}`, 76, 470);
  page.font('bold').fontSize(10).fillColor(gold).text('MÃ XÁC MINH', 76, 503);
  page
    .font('regular')
    .fontSize(11)
    .fillColor(ink)
    .text(certificate.verificationCode, 76, 522, { link: verificationUrl });

  const qrX = width - 180;
  drawQr(page, verificationUrl, qrX, 437, 104);
  page
    .font('regular')
    .fontSize(9)
    .fillColor(ink)
    .text('Quét để xác minh', qrX, 544, { width: 104, align: 'center' });

  return new Promise<Buffer>((resolve, reject) => {
    const parts: Buffer[] = [];
    page.on('data', (part: Buffer) => parts.push(part));
    page.once('error', reject);
    page.once('end', () => resolve(Buffer.concat(parts)));
    page.end();
  });
}

function centeredText(
  page: PDFKit.PDFDocument,
  value: string,
  y: number,
  height: number,
  size: number,
) {
  const options = { width: page.page.width - 160, align: 'center' as const };
  page.font('bold').fontSize(size);
  let measured = page.heightOfString(value, options);
  while (measured > height && size > 10) {
    page.fontSize(--size);
    measured = page.heightOfString(value, options);
  }
  page.text(value, 80, y + Math.max(0, (height - measured) / 2), options);
}

function drawQr(
  page: PDFKit.PDFDocument,
  url: string,
  x: number,
  y: number,
  size: number,
) {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const quietZone = 4;
  const dimension = size / (modules.size + quietZone * 2);
  page.rect(x, y, size, size).fill('#FFFFFF');
  for (let row = 0; row < modules.size; row += 1) {
    for (let column = 0; column < modules.size; column += 1) {
      if (modules.get(row, column))
        page.rect(
          x + (column + quietZone) * dimension,
          y + (row + quietZone) * dimension,
          dimension,
          dimension,
        );
    }
  }
  page.fill('#000000').link(x, y, size, size, url);
}
