import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Linking from 'expo-linking';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import {
  useVortexStore,
  VortexDiagramNode,
  VortexDiagramSpec,
} from '../store/useVortexStore';
import {
  getScaledFontSize,
  VORTEX_ACCENTS,
  VORTEX_FONTS,
  VORTEX_LAYOUT,
  VORTEX_PALETTE,
  VORTEX_SYNTAX,
} from '../theme/vortexTheme';
import {
  CheckIcon,
  CodeBracketsIcon,
  CopyIcon,
  DownloadIcon,
  ExpandIcon,
  ExternalLinkIcon,
  GhostHandIcon,
  InjectBoltIcon,
  SparklesIcon,
} from './VortexIcons';

const { VortexBridge } = NativeModules;

interface VortexRichBlocksProps {
  content: string;
  diagramSpec?: VortexDiagramSpec;
  generatedImageUrl?: string;
  onRegenerateImage?: (prompt: string) => void;
}

type ContentSegment =
  | { type: 'text'; value: string }
  | { type: 'code'; language: string; code: string };

const KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'class',
  'struct',
  'enum',
  'interface',
  'type',
  'public',
  'private',
  'protected',
  'static',
  'void',
  'int',
  'float',
  'double',
  'char',
  'bool',
  'boolean',
  'string',
  'val',
  'fun',
  'def',
  'import',
  'export',
  'from',
  'new',
  'this',
  'super',
  'async',
  'await',
  'override',
  'virtual',
  'template',
  'typename',
  'namespace',
  'using',
  'include',
  'null',
  'true',
  'false',
  'None',
  'True',
  'False',
]);

const CONTROL_WORDS = new Set([
  'if',
  'else',
  'elif',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'return',
  'try',
  'catch',
  'finally',
  'throw',
  'raises',
  'when',
]);

function splitMarkdownSegments(raw: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const fenceRegex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = fenceRegex.exec(raw);

  while (match !== null) {
    if (match.index > lastIndex) {
      const textPart = raw.slice(lastIndex, match.index).trim();
      if (textPart) {
        segments.push({ type: 'text', value: textPart });
      }
    }
    segments.push({
      type: 'code',
      language: (match[1] || 'code').toUpperCase(),
      code: match[2].replace(/\n$/, ''),
    });
    lastIndex = match.index + match[0].length;
    match = fenceRegex.exec(raw);
  }

  if (lastIndex < raw.length) {
    const trailing = raw.slice(lastIndex).trim();
    if (trailing) {
      segments.push({ type: 'text', value: trailing });
    }
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: raw }];
}

function tokenizeCodeLine(line: string): Array<{ text: string; color: string }> {
  const tokens: Array<{ text: string; color: string }> = [];
  const regex =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b[0-9]+(?:\.[0-9]+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b|[=+\-*/%<>!&|^~?:;.,()[\]{}]+|\s+)/g;

  let match: RegExpExecArray | null = regex.exec(line);
  while (match !== null) {
    const token = match[0];
    let color = VORTEX_SYNTAX.plain;

    if (
      (token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'")) ||
      (token.startsWith('`') && token.endsWith('`'))
    ) {
      color = VORTEX_SYNTAX.string;
    } else if (/^[0-9]/.test(token)) {
      color = VORTEX_SYNTAX.number;
    } else if (CONTROL_WORDS.has(token)) {
      color = VORTEX_SYNTAX.control;
    } else if (KEYWORDS.has(token)) {
      color = VORTEX_SYNTAX.keyword;
    } else if (/^[A-Z][A-Za-z0-9_]*$/.test(token)) {
      color = VORTEX_SYNTAX.type;
    } else if (/^[a-z_][A-Za-z0-9_]*$/.test(token)) {
      const nextChar = line[match.index + token.length];
      color = nextChar === '(' ? VORTEX_SYNTAX.functionName : VORTEX_SYNTAX.plain;
    } else if (/^[=+\-*/%<>!&|^~?:;.,()[\]{}]+$/.test(token)) {
      color = VORTEX_SYNTAX.operator;
    }

    tokens.push({ text: token, color });
    match = regex.exec(line);
  }

  return tokens.length > 0 ? tokens : [{ text: line, color: VORTEX_SYNTAX.plain }];
}

const SyntaxCodeBox: React.FC<{
  language: string;
  code: string;
  accentPrimary: string;
  accentSoft: string;
  accentBorder: string;
  codeFont: string;
  fontSize: number;
}> = ({
  language,
  code,
  accentPrimary,
  accentSoft,
  accentBorder,
  codeFont,
  fontSize,
}) => {
  const [copied, setCopied] = useState(false);
  const [injectStatus, setInjectStatus] = useState<'idle' | 'done'>('idle');
  const openCodeCanvas = useVortexStore((s) => s.openCodeCanvas);

  const lines = useMemo(() => code.split('\n'), [code]);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleInject = async (humanCadence: boolean) => {
    try {
      if (VortexBridge?.injectTextToFocusedNode) {
        const ok = await VortexBridge.injectTextToFocusedNode(code, humanCadence);
        if (ok) {
          setInjectStatus('done');
          setTimeout(() => setInjectStatus('idle'), 2000);
          return;
        }
      }
      await Clipboard.setStringAsync(code);
      Alert.alert(
        'Copied to Clipboard',
        'Focus an editable input box in any app first, then tap Inject.'
      );
    } catch (_e) {
    }
  };

  return (
    <View style={[styles.codeCard, { borderColor: accentBorder }]}>
      <View style={styles.codeHeader}>
        <View style={styles.codeLangBadge}>
          <CodeBracketsIcon size={13} color={accentPrimary} />
          <Text style={[styles.codeLangText, { color: accentPrimary, fontFamily: codeFont }]}>
            {language}
          </Text>
          <Text style={styles.codeLineCount}>{lines.length}L</Text>
        </View>

        <View style={styles.codeActionsRow}>
          <TouchableOpacity
            onPress={handleCopy}
            style={[styles.codeActionBtn, copied && { backgroundColor: accentSoft }]}
          >
            {copied ? (
              <CheckIcon size={12} color={VORTEX_PALETTE.success} />
            ) : (
              <CopyIcon size={12} color={VORTEX_PALETTE.textSecondary} />
            )}
            <Text style={styles.codeActionLabel}>{copied ? 'COPIED' : 'COPY'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleInject(false)}
            style={[
              styles.codeActionBtn,
              injectStatus === 'done' && { backgroundColor: VORTEX_PALETTE.successSoft },
            ]}
          >
            <InjectBoltIcon size={12} color={accentPrimary} />
            <Text style={[styles.codeActionLabel, { color: accentPrimary }]}>
              {injectStatus === 'done' ? 'INJECTED' : 'INJECT'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => handleInject(true)} style={styles.codeActionBtn}>
            <GhostHandIcon size={12} color={VORTEX_PALETTE.warning} />
            <Text style={[styles.codeActionLabel, { color: VORTEX_PALETTE.warning }]}>GHOST</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              openCodeCanvas({
                title: `${language} Module`,
                language,
                code,
              })
            }
            style={styles.codeActionBtn}
          >
            <ExpandIcon size={12} color={VORTEX_PALETTE.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.codeScroll}>
        <View style={styles.codeBody}>
          {lines.map((line, idx) => {
            const tokens = tokenizeCodeLine(line);
            return (
              <View key={`ln_${idx}`} style={styles.codeLineRow}>
                <Text style={[styles.gutterNumber, { fontFamily: codeFont, fontSize: fontSize - 2 }]}>
                  {String(idx + 1).padStart(2, ' ')}
                </Text>
                <Text style={[styles.codeText, { fontFamily: codeFont, fontSize }]}>
                  {tokens.map((tok, tIdx) => (
                    <Text key={`tk_${idx}_${tIdx}`} style={{ color: tok.color }}>
                      {tok.text}
                    </Text>
                  ))}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const InteractiveDiagramBlock: React.FC<{
  spec: VortexDiagramSpec;
  accentPrimary: string;
  accentBorder: string;
  regularFont: string;
}> = ({ spec, accentPrimary, accentBorder, regularFont }) => {
  const openCodeCanvas = useVortexStore((s) => s.openCodeCanvas);

  const layout = useMemo(() => {
    const tiers = new Map<number, VortexDiagramNode[]>();
    spec.nodes.forEach((node) => {
      const t = Number.isFinite(node.tier) ? node.tier : 0;
      const list = tiers.get(t) || [];
      list.push(node);
      tiers.set(t, list);
    });

    const sortedTierKeys = Array.from(tiers.keys()).sort((a, b) => a - b);
    const nodeW = 136;
    const nodeH = 48;
    const colGap = 24;
    const rowGap = 54;
    const padX = 20;
    const padY = 20;

    let maxCols = 1;
    sortedTierKeys.forEach((k) => {
      const len = tiers.get(k)?.length || 1;
      if (len > maxCols) maxCols = len;
    });

    const canvasW = Math.max(320, maxCols * nodeW + (maxCols - 1) * colGap + padX * 2);
    const canvasH = Math.max(
      150,
      sortedTierKeys.length * nodeH + Math.max(0, sortedTierKeys.length - 1) * rowGap + padY * 2
    );

    const coords = new Map<
      string,
      { x: number; y: number; cx: number; cy: number; node: VortexDiagramNode }
    >();

    sortedTierKeys.forEach((tierKey, rowIdx) => {
      const rowNodes = tiers.get(tierKey) || [];
      const rowWidth = rowNodes.length * nodeW + (rowNodes.length - 1) * colGap;
      const startX = (canvasW - rowWidth) / 2;
      const y = padY + rowIdx * (nodeH + rowGap);

      rowNodes.forEach((node, colIdx) => {
        const x = startX + colIdx * (nodeW + colGap);
        coords.set(node.id, {
          x,
          y,
          cx: x + nodeW / 2,
          cy: y + nodeH / 2,
          node,
        });
      });
    });

    return { canvasW, canvasH, nodeW, nodeH, coords };
  }, [spec]);

  return (
    <View style={[styles.diagramCard, { borderColor: accentBorder }]}>
      <View style={styles.diagramHeader}>
        <View style={styles.diagramTitleRow}>
          <SparklesIcon size={14} color={accentPrimary} />
          <Text style={[styles.diagramTitle, { fontFamily: regularFont }]}>{spec.title}</Text>
        </View>
        <TouchableOpacity
          onPress={() =>
            openCodeCanvas({
              title: spec.title,
              language: 'VORTEX-DIAGRAM',
              code: JSON.stringify(spec, null, 2),
              diagramSpec: spec,
            })
          }
          style={styles.codeActionBtn}
        >
          <ExpandIcon size={12} color={accentPrimary} />
          <Text style={[styles.codeActionLabel, { color: accentPrimary }]}>INSPECT</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={layout.canvasW} height={layout.canvasH}>
          <Defs>
            <LinearGradient id="vortexNodeGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#161C2C" stopOpacity="1" />
              <Stop offset="1" stopColor="#0D111A" stopOpacity="1" />
            </LinearGradient>
          </Defs>

          {spec.edges.map((edge, idx) => {
            const fromPos = layout.coords.get(edge.from);
            const toPos = layout.coords.get(edge.to);
            if (!fromPos || !toPos) return null;

            const startX = fromPos.cx;
            const startY = fromPos.y + layout.nodeH;
            const endX = toPos.cx;
            const endY = toPos.y;
            const midY = (startY + endY) / 2;
            const d = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;

            return (
              <G key={`edge_${idx}`}>
                <Path
                  d={d}
                  stroke={accentPrimary}
                  strokeWidth={1.7}
                  strokeOpacity={0.75}
                  fill="none"
                />
                <Circle cx={endX} cy={endY} r={3} fill={accentPrimary} />
                {edge.label ? (
                  <SvgText
                    x={(startX + endX) / 2}
                    y={midY - 4}
                    fill={VORTEX_PALETTE.textSecondary}
                    fontSize={9}
                    textAnchor="middle"
                  >
                    {edge.label.slice(0, 18)}
                  </SvgText>
                ) : null}
              </G>
            );
          })}

          {Array.from(layout.coords.values()).map(({ x, y, cx, node }) => {
            const strokeCol = node.accent || accentPrimary;
            return (
              <G key={node.id}>
                <Rect
                  x={x}
                  y={y}
                  width={layout.nodeW}
                  height={layout.nodeH}
                  rx={11}
                  fill="url(#vortexNodeGrad)"
                  stroke={strokeCol}
                  strokeWidth={1.3}
                />
                <SvgText
                  x={cx}
                  y={y + (node.sublabel ? 20 : 28)}
                  fill={VORTEX_PALETTE.textPrimary}
                  fontSize={11}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {node.label.slice(0, 20)}
                </SvgText>
                {node.sublabel ? (
                  <SvgText
                    x={cx}
                    y={y + 35}
                    fill={VORTEX_PALETTE.textSecondary}
                    fontSize={9}
                    textAnchor="middle"
                  >
                    {node.sublabel.slice(0, 22)}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      </ScrollView>
    </View>
  );
};

const InlineFormattedParagraph: React.FC<{
  text: string;
  accentPrimary: string;
  regularFont: string;
  boldFont: string;
  codeFont: string;
  fontSize: number;
}> = ({ text, accentPrimary, regularFont, boldFont, codeFont, fontSize }) => {
  const lines = text.split('\n');
  const urls = useMemo(() => {
    const matches = text.match(/https?:\/\/[^\s)]+/g) || [];
    return Array.from(new Set(matches)).slice(0, 4);
  }, [text]);

  return (
    <View style={styles.paragraphWrap}>
      {lines.map((line, lIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <View key={`sp_${lIdx}`} style={{ height: 6 }} />;
        }

        const isBullet = /^[-*•]\s+/.test(trimmed);
        const cleanLine = isBullet ? trimmed.replace(/^[-*•]\s+/, '') : line;
        const parts = cleanLine.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

        return (
          <View key={`ln_${lIdx}`} style={isBullet ? styles.bulletRow : styles.textLineRow}>
            {isBullet ? (
              <Text style={[styles.bulletDot, { color: accentPrimary, fontSize }]}>•</Text>
            ) : null}
            <Text
              style={[
                styles.bodyText,
                {
                  fontFamily: regularFont,
                  fontSize,
                  lineHeight: Math.round(fontSize * 1.48),
                },
              ]}
            >
              {parts.map((part, pIdx) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return (
                    <Text
                      key={`b_${pIdx}`}
                      style={{ fontFamily: boldFont, color: VORTEX_PALETTE.textPrimary }}
                    >
                      {part.slice(2, -2)}
                    </Text>
                  );
                }
                if (part.startsWith('`') && part.endsWith('`')) {
                  return (
                    <Text
                      key={`c_${pIdx}`}
                      style={{
                        fontFamily: codeFont,
                        color: accentPrimary,
                        backgroundColor: 'rgba(255,255,255,0.06)',
                      }}
                    >
                      {` ${part.slice(1, -1)} `}
                    </Text>
                  );
                }
                return <Text key={`t_${pIdx}`}>{part}</Text>;
              })}
            </Text>
          </View>
        );
      })}

      {urls.length > 0 ? (
        <View style={styles.linkChipsWrap}>
          {urls.map((url, idx) => (
            <TouchableOpacity
              key={`url_${idx}`}
              onPress={() => void Linking.openURL(url)}
              style={[styles.linkChip, { borderColor: VORTEX_PALETTE.borderStrong }]}
            >
              <ExternalLinkIcon size={12} color={accentPrimary} />
              <Text numberOfLines={1} style={[styles.linkChipText, { color: accentPrimary }]}>
                {url.replace(/^https?:\/\//, '').slice(0, 34)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
};

export const VortexRichBlocks: React.FC<VortexRichBlocksProps> = ({
  content,
  diagramSpec,
  generatedImageUrl,
  onRegenerateImage,
}) => {
  const fontPreset = useVortexStore((s) => s.fontPreset);
  const fontScale = useVortexStore((s) => s.fontScale);
  const accentKey = useVortexStore((s) => s.orbAccentKey);

  const accent = VORTEX_ACCENTS[accentKey] || VORTEX_ACCENTS.sky;
  const fonts = VORTEX_FONTS[fontPreset] || VORTEX_FONTS.aero;
  const bodySize = getScaledFontSize(14.5, fontScale);
  const codeSize = getScaledFontSize(12.5, fontScale);

  const segments = useMemo(() => splitMarkdownSegments(content), [content]);
  const [savedImageToast, setSavedImageToast] = useState(false);

  const handleSaveGeneratedImage = async () => {
    if (!generatedImageUrl) return;
    try {
      const dest = `${FileSystem.documentDirectory}VORTEX_Render_${Date.now()}.jpg`;
      await FileSystem.downloadAsync(generatedImageUrl, dest);
      setSavedImageToast(true);
      setTimeout(() => setSavedImageToast(false), 2000);
    } catch (_e) {
    }
  };

  return (
    <View style={styles.container}>
      {segments.map((seg, idx) =>
        seg.type === 'code' ? (
          <SyntaxCodeBox
            key={`seg_code_${idx}`}
            language={seg.language}
            code={seg.code}
            accentPrimary={accent.primary}
            accentSoft={accent.soft}
            accentBorder={accent.border}
            codeFont={fonts.code}
            fontSize={codeSize}
          />
        ) : (
          <InlineFormattedParagraph
            key={`seg_txt_${idx}`}
            text={seg.value}
            accentPrimary={accent.primary}
            regularFont={fonts.regular}
            boldFont={fonts.bold}
            codeFont={fonts.code}
            fontSize={bodySize}
          />
        )
      )}

      {diagramSpec ? (
        <InteractiveDiagramBlock
          spec={diagramSpec}
          accentPrimary={accent.primary}
          accentBorder={accent.border}
          regularFont={fonts.bold}
        />
      ) : null}

      {generatedImageUrl ? (
        <View style={[styles.imageCard, { borderColor: accent.border }]}>
          <Image
            source={{ uri: generatedImageUrl }}
            style={styles.generatedImage}
            resizeMode="cover"
          />
          <View style={styles.imageFooter}>
            <Text style={styles.imageBadge}>POLLINATIONS HD RENDER</Text>
            <View style={styles.imageActions}>
              {onRegenerateImage ? (
                <TouchableOpacity
                  onPress={() => onRegenerateImage(content)}
                  style={styles.codeActionBtn}
                >
                  <SparklesIcon size={12} color={accent.primary} />
                  <Text style={[styles.codeActionLabel, { color: accent.primary }]}>RE-ROLL</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={handleSaveGeneratedImage} style={styles.codeActionBtn}>
                {savedImageToast ? (
                  <CheckIcon size={12} color={VORTEX_PALETTE.success} />
                ) : (
                  <DownloadIcon size={12} color={VORTEX_PALETTE.textPrimary} />
                )}
                <Text style={styles.codeActionLabel}>
                  {savedImageToast ? 'SAVED' : 'SAVE'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  paragraphWrap: {
    gap: 4,
  },
  textLineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 4,
    gap: 8,
  },
  bulletDot: {
    fontWeight: '700',
    marginTop: 1,
  },
  bodyText: {
    color: VORTEX_PALETTE.textPrimary,
    flexShrink: 1,
  },
  codeCard: {
    backgroundColor: VORTEX_SYNTAX.background,
    borderRadius: VORTEX_LAYOUT.radiusMd,
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: 4,
  },
  codeHeader: {
    backgroundColor: VORTEX_SYNTAX.headerBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: VORTEX_PALETTE.borderHairline,
  },
  codeLangBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  codeLangText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  codeLineCount: {
    fontSize: 10,
    color: VORTEX_PALETTE.textMuted,
  },
  codeActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  codeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  codeActionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: VORTEX_PALETTE.textSecondary,
    letterSpacing: 0.4,
  },
  codeScroll: {
    maxHeight: 340,
  },
  codeBody: {
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  codeLineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 19,
  },
  gutterNumber: {
    color: VORTEX_SYNTAX.gutterText,
    width: 26,
    textAlign: 'right',
    marginRight: 10,
    userSelect: 'none',
  },
  codeText: {
    color: VORTEX_SYNTAX.plain,
  },
  diagramCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusMd,
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: 4,
  },
  diagramHeader: {
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: VORTEX_PALETTE.borderHairline,
  },
  diagramTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  diagramTitle: {
    color: VORTEX_PALETTE.textPrimary,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  linkChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  linkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: VORTEX_LAYOUT.radiusPill,
    borderWidth: 1,
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
  },
  linkChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  imageCard: {
    backgroundColor: VORTEX_PALETTE.surfaceCard,
    borderRadius: VORTEX_LAYOUT.radiusMd,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 4,
  },
  generatedImage: {
    width: '100%',
    height: 240,
    backgroundColor: VORTEX_PALETTE.surfaceBase,
  },
  imageFooter: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: VORTEX_PALETTE.surfaceElevated,
  },
  imageBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: VORTEX_PALETTE.textSecondary,
    letterSpacing: 0.6,
  },
  imageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
