import {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  HorizontalPositionRelativeFrom,
  ImageRun,
  PageNumber,
  Paragraph,
  ParagraphChild,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from "docx";
import { SEITE } from "../../render/PageFrame";
import { kiVermerkText, vermerkSichtbar } from "@shared/kiKennzeichnung";
import { PRINT_MARGINS } from "@shared/design";
import {
  dataUrlBytes,
  imageRun,
  NO_BORDERS,
  run,
  RunOptions,
} from "../../../../shared/export/docxKit";
import {
  richTextRuns,
  richTextToParagraphs,
} from "../../../../shared/richtext/docx";
import {
  footerSlotText,
  kompaktVorTitel,
  kopfTitel,
  kopfUeberthema,
  pageLabels,
  sidebarBox,
  sidebarText,
} from "../../render/PageFrame";
import { Child, EMU_MM, Ctx } from "./grundlagen";
import { musterWordSchattierung } from "../../../../shared/fachfarben";

// ---------- Kopf und Fuß ----------

export async function logoRun(
  ctx: Ctx,
  heightMm: number
): Promise<ImageRun | null> {
  const logo = ctx.deps.logo;
  if (!logo || !ctx.ws.design.header.showLogo) return null;
  const dim = await ctx.deps.sizer(logo);
  const h = heightMm * (96 / 25.4);
  return imageRun(logo, (dim.width / dim.height) * h, h);
}

export async function sidebarRun(ctx: Ctx): Promise<ImageRun | null> {
  const s = ctx.info.design.sidebar;
  if (!s.show) return null;
  // Wie in der Vorschau: im bedruckbaren Bereich, links hinter dem Lochrand
  const box = sidebarBox(ctx.info.design)!;
  const height = 297 - 2 * PRINT_MARGINS.bleedSafeMm;
  const png = await ctx.deps.sidebar(
    sidebarText(ctx.info),
    s.color,
    s.widthMm,
    height
  );
  const { data } = dataUrlBytes(png);
  return new ImageRun({
    type: "png",
    data,
    transformation: {
      width: Math.round(s.widthMm * (96 / 25.4)),
      height: Math.round(height * (96 / 25.4)),
    },
    floating: {
      horizontalPosition: {
        relative: HorizontalPositionRelativeFrom.PAGE,
        offset: Math.round(
          (s.side === "left" ? box.start : 210 - s.widthMm - box.start) * EMU_MM
        ),
      },
      verticalPosition: {
        relative: VerticalPositionRelativeFrom.PAGE,
        offset: Math.round(PRINT_MARGINS.bleedSafeMm * EMU_MM),
      },
      behindDocument: true,
      allowOverlap: true,
      wrap: { type: TextWrappingType.NONE },
    },
  });
}

export async function headerFor(ctx: Ctx, first: boolean): Promise<Header> {
  // Aus `info`: Ein Blatt kann eine eigene Kopfzeile haben (Fassung B, C …)
  const d = ctx.info.design;
  const h = d.header;
  const title = kopfTitel(ctx.ws.meta, ctx.key);
  const children: Child[] = [];
  const sidebar = await sidebarRun(ctx);
  const mode = first ? "full" : h.followingPages;

  if (mode === "none") {
    children.push(new Paragraph({ children: sidebar ? [sidebar] : [] }));
    return new Header({ children });
  }
  // Überthema (Paket 11) – dieselbe Aufteilung wie in der Vorschau (render/PageFrame.tsx)
  const u = kopfUeberthema(ctx.info);
  if (mode === "compact") {
    const logo = await logoRun(ctx, 6);
    const rechts = u.block || ctx.info.levelMark;
    children.push(
      new Paragraph({
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 6,
            color: ctx.accent,
            space: 2,
          },
        },
        tabStops: [{ type: TabStopType.RIGHT, position: ctx.contentWidth }],
        children: [
          ...(sidebar ? [sidebar] : []),
          ...(logo ? [logo, run("  ")] : []),
          run(kompaktVorTitel(ctx.info) + title, {
            size: ctx.size - 4,
            color: "444444",
          }),
          ...(rechts ? [run("\t")] : []),
          ...(u.block
            ? [
                run(u.ueber, {
                  size: ctx.size - 4,
                  color: ctx.accent,
                  bold: true,
                }),
              ]
            : []),
          ...(ctx.info.levelMark
            ? [
                run(`${u.block ? "  " : ""}${ctx.info.levelMark}`, {
                  size: ctx.size - 4,
                  color: "666666",
                }),
              ]
            : []),
        ],
      })
    );
    return new Header({ children });
  }

  const white = h.layout === "colorBand";
  const color = white ? "FFFFFF" : undefined;
  const align = h.layout === "centered" ? AlignmentType.CENTER : undefined;
  const textParas: Paragraph[] = [];
  if (h.showSchoolName && ctx.info.schoolName)
    textParas.push(
      new Paragraph({
        alignment: align,
        children: [
          run(ctx.info.schoolName, {
            size: ctx.size - 5,
            color: color ?? "555555",
          }),
        ],
      })
    );
  if (h.showTitle)
    textParas.push(
      // Auch die Kopfzeile: ein Mathematikblatt kann „Rechnen mit $a^m \cdot a^n$" heissen
      new Paragraph({
        alignment: align,
        children: await richRun(ctx, title, {
          bold: true,
          size: Math.round(ctx.size * 1.55),
          color,
        }),
      })
    );
  const labels = pageLabels(ctx.info);
  // In der Sprache des Blattes (Englischarbeit: „Class 13") – wie die Vorschau
  const subjectLine = [
    u.fachZeile,
    ctx.ws.meta.grade ? labels.grade(ctx.ws.meta.grade) : "",
    h.customText,
  ]
    .filter(Boolean)
    .join(" · ");
  if (subjectLine)
    textParas.push(
      new Paragraph({
        alignment: align,
        children: [
          run(subjectLine, { size: ctx.size - 4, color: color ?? "444444" }),
        ],
      })
    );
  // Überthema als eigener Block: rechts im Kopf bzw. unter dem zentrierten Kopf
  const ueberParas = (
    ausrichtung: (typeof AlignmentType)[keyof typeof AlignmentType]
  ): Paragraph[] =>
    u.block
      ? [
          ...(u.block.fach
            ? [
                new Paragraph({
                  alignment: ausrichtung,
                  children: [
                    run(u.block.fach, {
                      size: ctx.size - 7,
                      color: color ?? "555555",
                      allCaps: true,
                    }),
                  ],
                }),
              ]
            : []),
          new Paragraph({
            alignment: ausrichtung,
            children: [
              run(u.block.thema, {
                size: u.stil === "emphasis" ? ctx.size + 1 : ctx.size - 2,
                bold: true,
                color: color ?? ctx.accent,
              }),
            ],
          }),
        ]
      : [];
  const badgeText = [
    h.showSheetNumber && ctx.ws.meta.sheetNumber
      ? `AB ${ctx.ws.meta.sheetNumber}`
      : "",
    ctx.info.levelMark ?? "",
  ]
    .filter(Boolean)
    .join("  ");
  const logo = await logoRun(ctx, h.logoHeightMm);

  if (h.layout === "centered") {
    if (logo)
      children.push(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [logo] })
      );
    textParas.forEach((p) => children.push(p));
    ueberParas(AlignmentType.CENTER).forEach((p) => children.push(p));
    if (badgeText)
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [run(badgeText, { bold: true, size: ctx.size - 4 })],
        })
      );
    children.push(
      new Paragraph({
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 12,
            color: ctx.accent,
            space: 1,
          },
        },
        children: [],
      })
    );
  } else {
    const logoW = logo ? Math.round(ctx.contentWidth * 0.22) : 0;
    const badgeW = badgeText ? Math.round(ctx.contentWidth * 0.14) : 0;
    const ueberW = u.block ? Math.round(ctx.contentWidth * 0.26) : 0;
    const textW = ctx.contentWidth - logoW - badgeW - ueberW;
    const cellOpts = (width: number) => ({
      width: { size: width, type: WidthType.DXA },
      borders: NO_BORDERS,
      verticalAlign: VerticalAlign.CENTER,
      // Farbe + Muster (30.09.2026): Muster-Fächer bekommen im Farbband eine gemusterte Schattierung
      ...(white
        ? {
            shading: musterWordSchattierung(
              ctx.accent,
              ctx.info.design.page.accentMuster
            ),
          }
        : {}),
      margins: { left: 80, right: 80, top: 60, bottom: 60 },
    });
    const cells: TableCell[] = [];
    const logoCell = logo
      ? new TableCell({
          ...cellOpts(logoW),
          children: [new Paragraph({ children: [logo] })],
        })
      : null;
    const textCell = new TableCell({
      ...cellOpts(textW),
      children: textParas.length ? textParas : [new Paragraph("")],
    });
    const ueberCell = u.block
      ? new TableCell({
          ...cellOpts(ueberW),
          children: ueberParas(AlignmentType.RIGHT),
        })
      : null;
    const badgeCell = badgeText
      ? new TableCell({
          ...cellOpts(badgeW),
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                run(badgeText, { bold: true, size: ctx.size - 3, color }),
              ],
            }),
          ],
        })
      : null;
    if (h.layout === "logoRight") {
      if (badgeCell) cells.push(badgeCell);
      cells.push(textCell);
      if (ueberCell) cells.push(ueberCell);
      if (logoCell) cells.push(logoCell);
    } else {
      if (logoCell) cells.push(logoCell);
      cells.push(textCell);
      if (ueberCell) cells.push(ueberCell);
      if (badgeCell) cells.push(badgeCell);
    }
    /*
     * Spaltenraster ausdrücklich setzen (Befund der Lehrkraft vom 28.09.2026): Ohne `columnWidths`
     * legt Word das Raster mit Standardbreiten an und hält es wegen des festen Layouts ein – das
     * farbige Kopfband reichte nur über gut die Hälfte der Seite.
     */
    const breiten = [
      ...(h.layout === "logoRight"
        ? [
            badgeCell ? badgeW : 0,
            textW,
            ueberCell ? ueberW : 0,
            logoCell ? logoW : 0,
          ]
        : [
            logoCell ? logoW : 0,
            textW,
            ueberCell ? ueberW : 0,
            badgeCell ? badgeW : 0,
          ]),
    ].filter((w) => w > 0);
    children.push(
      new Table({
        width: { size: ctx.contentWidth, type: WidthType.DXA },
        columnWidths: breiten,
        layout: TableLayoutType.FIXED,
        rows: [new TableRow({ children: cells })],
      })
    );
    if (!white)
      children.push(
        new Paragraph({
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 12,
              color: ctx.accent,
              space: 1,
            },
          },
          children: [],
        })
      );
  }

  if (!ctx.key && (h.fields.name || h.fields.class || h.fields.date)) {
    const fields: [string, number][] = [];
    if (h.fields.name) fields.push([labels.name, 5]);
    if (h.fields.class) fields.push([labels.class, 2]);
    if (h.fields.date) fields.push([labels.date, 2.5]);
    const total = fields.reduce((s, [, w]) => s + w, 0);
    const cells: TableCell[] = [];
    const spalten: number[] = [];
    // Nur das Datum: schmales Feld rechts statt einer Zeile über die ganze Breite
    const dateOnly = fields.length === 1 && h.fields.date;
    if (dateOnly) {
      spalten.push(Math.round(ctx.contentWidth * 0.75));
      cells.push(
        new TableCell({
          width: {
            size: Math.round(ctx.contentWidth * 0.75),
            type: WidthType.DXA,
          },
          borders: NO_BORDERS,
          children: [new Paragraph("")],
        })
      );
    }
    // Breite der Beschriftung nach ihrer Länge (≈ 0,6 Schriftgrad je Zeichen + Luft) – „Klasse:" brach sonst mitten im Wort um
    const beschriftung = (label: string): number =>
      Math.round(label.length * (ctx.size - 2) * 6.5 + 160);
    for (const [label, weight] of fields) {
      const width = dateOnly
        ? Math.round(ctx.contentWidth * 0.25)
        : Math.round((ctx.contentWidth * weight) / total);
      const lw = Math.min(Math.round(width * 0.6), beschriftung(label));
      spalten.push(lw, width - lw);
      cells.push(
        new TableCell({
          width: { size: lw, type: WidthType.DXA },
          borders: NO_BORDERS,
          verticalAlign: VerticalAlign.BOTTOM,
          children: [
            new Paragraph({ children: [run(label, { size: ctx.size - 2 })] }),
          ],
        }),
        new TableCell({
          width: { size: width - lw, type: WidthType.DXA },
          borders: {
            ...NO_BORDERS,
            bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
          },
          children: [new Paragraph("")],
        })
      );
    }
    children.push(
      new Table({
        width: { size: ctx.contentWidth, type: WidthType.DXA },
        columnWidths: spalten,
        layout: TableLayoutType.FIXED,
        rows: [
          new TableRow({
            height: { value: 460, rule: "atLeast" },
            children: cells,
          }),
        ],
      })
    );
  }
  // Seitenleiste als verankertes Bild im ersten Absatz
  if (sidebar)
    children.unshift(
      new Paragraph({ spacing: { before: 0, after: 0 }, children: [sidebar] })
    );
  return new Header({ children });
}

export function footerFor(ctx: Ctx): Footer {
  const f = ctx.ws.design.footer;
  // KI-Vermerk (Großprogramm 0.4): eigene kleine Zeile im Fuß, nach Wahl nur im Lösungsteil
  const meta = ctx.ws.meta;
  const vermerk = vermerkSichtbar(meta.ki, meta.kiVermerk, ctx.key)
    ? [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 60 },
          children: [
            new TextRun({
              text: kiVermerkText(
                meta.ki!,
                ctx.info.language === "en" ? "en" : "de"
              ),
              size: 13,
              color: "777777",
            }),
          ],
        }),
      ]
    : [];
  if (!f.show)
    return new Footer({
      children: vermerk.length ? vermerk : [new Paragraph("")],
    });
  const slot = (s: typeof f.left): ParagraphChild[] => {
    if (s === "pageNumber")
      return [
        new TextRun({
          children: [
            `${SEITE[ctx.info.language ?? "de"]} `,
            PageNumber.CURRENT,
            " / ",
            PageNumber.TOTAL_PAGES_IN_SECTION,
          ],
          size: ctx.size - 6,
          color: "555555",
        }),
      ];
    const text = footerSlotText(s, ctx.info, 1, 1);
    return text ? [run(text, { size: ctx.size - 6, color: "555555" })] : [];
  };
  return new Footer({
    children: [
      new Paragraph({
        border: {
          top: {
            style: BorderStyle.SINGLE,
            size: 4,
            color: "999999",
            space: 4,
          },
        },
        tabStops: [
          {
            type: TabStopType.CENTER,
            position: Math.round(ctx.contentWidth / 2),
          },
          { type: TabStopType.RIGHT, position: ctx.contentWidth },
        ],
        children: [
          ...slot(f.left),
          run("\t"),
          ...slot(f.center),
          run("\t"),
          ...slot(f.right),
        ],
      }),
      ...vermerk,
    ],
  });
}

// ---------- Bausteine ----------

export const rich = (
  ctx: Ctx,
  text: string,
  extra: Partial<Parameters<typeof richTextToParagraphs>[1]> = {}
) =>
  richTextToParagraphs(text, {
    size: ctx.size,
    raster: ctx.deps.raster,
    ...extra,
  });

/**
 * Ein kurzes Feld mit Formeln und **Fettdruck** – Überschriften, Bildunterschriften,
 * Antwortmöglichkeiten, Zuordnungen.
 *
 * Diese Felder liefen früher über `run()` und damit als reiner Text. Am Bildschirm und im PDF
 * stand deshalb `$b^4 \cdot b^3$` wörtlich da; nach der Umstellung des Blatt-Renderers auf
 * `RichText` wäre im Word-Export als einziges Ausgabeformat weiterhin roher Text gestanden.
 */
export const richRun = (
  ctx: Ctx,
  text: string,
  opts: RunOptions = {}
): Promise<ParagraphChild[]> =>
  richTextRuns(text, {
    size: opts.size ?? ctx.size,
    raster: ctx.deps.raster,
    run: opts,
  });
