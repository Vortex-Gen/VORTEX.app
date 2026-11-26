import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  NativeModules,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import {
  VORTEX_BOX_STYLES,
  VORTEX_COLORS,
  VORTEX_FONTS,
  VORTEX_SYNTAX_COLORS,
  VORTEX_TYPOGRAPHY,
} from '../theme/vortexTheme';

const { VortexBridge } = NativeModules;
const SCREEN_W = Dimensions.get('window').width;

export interface VerifiedWebLink {
  url: string;
  title: string;
  domain: string;
  snippet: string;
  extractedContent: string;
  verified: boolean;
  httpStatus: number;
  readViaGhost?: boolean;
}

export interface WebImageResult {
  imageUrl: string;
  title: string;
  sourceUrl: string;
}

export interface GeneratedAiImage {
  prompt: string;
  imageUrl: string;
  model: string;
  seed: number;
}

interface DiagramNode {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  shape: 'rect' | 'diamond' | 'circle';
  color: string;
}

interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

interface ParsedDiagram {
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  width: number;
  height: number;
}

const KEYWORDS = new Set([
  'int', 'void', 'char', 'float', 'double', 'long', 'short', 'bool', 'boolean',
  'class', 'struct', 'public', 'private', 'protected', 'static', 'final', 'const',
  'let', 'var', 'val', 'fun', 'function', 'def', 'return', 'if', 'else', 'elif',
  'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch',
  'throw', 'new', 'delete', 'this', 'super', 'import', 'from', 'export', 'async',
  'await', 'using', 'namespace', 'template', 'typename', 'virtual', 'override',
  'null', 'nullptr', 'true', 'false', 'None', 'True', 'False', 'self',
]);

const TYPES = new Set([
  'String', 'Int', 'Float', 'Double', 'Boolean', 'List', 'Map', 'Set', 'Array',
  'Promise', 'View', 'Text', 'Node', 'TreeNode', 'Graph', 'Stack', 'Queue',
  'vector', 'string', 'pair', 'map', 'set', 'queue', 'stack', 'size_t', 'uint8_t',
]);

function renderHighlightedLine(line: string, lineIdx: number) {
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('#') && !trimmed.startsWith('#include') && !trimmed.startsWith('#define')) {
    return (
      <Text key={lineIdx} style={[VORTEX_TYPOGRAPHY.codeBlockText, { color: VORTEX_SYNTAX_COLORS.comment }]}>
        {line || ' '}
      </Text>
    );
  }
  if (trimmed.startsWith('#include') || trimmed.startsWith('#define') || trimmed.startsWith('@')) {
    return (
      <Text key={lineIdx} style={[VORTEX_TYPOGRAPHY.codeBlockText, { color: VORTEX_SYNTAX_COLORS.preprocessor }]}>
        {line || ' '}
      </Text>
    );
  }

  const tokens = line.split(/(\s+|[()[\]{};,.:+\-*/%=<>!&|]+|"[^"]*"|'[^']*')/g).filter(Boolean);
  if (tokens.length === 0) {
    return <Text key={lineIdx} style={VORTEX_TYPOGRAPHY.codeBlockText}>{' '}</Text>;
  }

  return (
    <Text key={lineIdx} style={VORTEX_TYPOGRAPHY.codeBlockText}>
      {tokens.map((tok, i) => {
        let color: string = VORTEX_SYNTAX_COLORS.plain;
        if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'"))) {
          color = VORTEX_SYNTAX_COLORS.string;
        } else if (/^\d+(\.\d+)?$/.test(tok)) {
          color = VORTEX_SYNTAX_COLORS.number;
        } else if (KEYWORDS.has(tok)) {
          color = VORTEX_SYNTAX_COLORS.keyword;
        } else if (TYPES.has(tok)) {
          color = VORTEX_SYNTAX_COLORS.type;
        } else if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tok) && tokens[i + 1]?.startsWith('(')) {
          color = VORTEX_SYNTAX_COLORS.function;
        } else if (/^[=+\-*/<>!&|:]+$/.test(tok)) {
          color = VORTEX_SYNTAX_COLORS.operator;
        }
        return (
          <Text key={i} style={{ color }}>
            {tok}
          </Text>
        );
      })}
    </Text>
  );
}

export const VortexCodeBox: React.FC<{
  language: string;
  code: string;
  onInjectFeedback?: (msg: string) => void;
}> = ({ language, code, onInjectFeedback }) => {
  const [copied, setCopied] = useState(false);
  const cleanCode = code.trim();
  const lines = useMemo(() => cleanCode.split('\n'), [cleanCode]);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(cleanCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleInject = async (humanTyping: boolean) => {
    await Clipboard.setStringAsync(cleanCode);
    if (VortexBridge?.injectTextToScreen) {
      const ok = await VortexBridge.injectTextToScreen(cleanCode, humanTyping);
      const msg = ok
        ? humanTyping
          ? 'Human-typed into active screen field.'
          : 'Code injected directly into active editor.'
        : 'Copied to clipboard! Open any editor & tap capsule INJECT.';
      onInjectFeedback?.(msg);
      Alert.alert('VORTEX Code Injector', msg);
    } else {
      Alert.alert('Copied', 'Code copied to clipboard.');
    }
  };

  return (
    <View style={VORTEX_BOX_STYLES.codeBox}>
      <View style={styles.boxHeader}>
        <View style={styles.langPill}>
          <View style={[styles.dot, { backgroundColor: VORTEX_COLORS.aiHeadingCyan }]} />
          <Text style={[VORTEX_TYPOGRAPHY.badgeText, { color: VORTEX_COLORS.aiHeadingCyan }]}>
            {(language || 'CODE').toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.chipBtn} onPress={handleCopy}>
            <Text style={[styles.chipBtnText, { color: copied ? VORTEX_COLORS.aiAccentEmerald : '#E2E8F0' }]}>
              {copied ? 'COPIED' : 'COPY'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chipBtn, { borderColor: VORTEX_COLORS.aiHeadingCyan }]}
            onPress={() => handleInject(false)}
          >
            <Text style={[styles.chipBtnText, { color: VORTEX_COLORS.aiHeadingCyan }]}>INJECT</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chipBtn, { borderColor: VORTEX_COLORS.aiAccentViolet }]}
            onPress={() => handleInject(true)}
          >
            <Text style={[styles.chipBtnText, { color: VORTEX_COLORS.aiAccentViolet }]}>GHOST TYPE</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.codeScrollPad}>
        <View>
          {lines.map((line, idx) => (
            <View key={idx} style={styles.codeLineRow}>
              <Text style={styles.lineNumber}>{String(idx + 1).padStart(2, '0')}</Text>
              {renderHighlightedLine(line, idx)}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

export const VortexPromptBox: React.FC<{
  title?: string;
  promptText: string;
  onExecutePrompt?: (text: string) => void;
}> = ({ title = 'PROMPT / COMMAND BLOCK', promptText, onExecutePrompt }) => {
  const [copied, setCopied] = useState(false);
  const clean = promptText.trim();

  const handleCopy = async () => {
    await Clipboard.setStringAsync(clean);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <View style={VORTEX_BOX_STYLES.promptInjectBox}>
      <View style={[styles.boxHeader, { backgroundColor: VORTEX_COLORS.promptBoxHeader }]}>
        <View style={styles.langPill}>
          <View style={[styles.dot, { backgroundColor: VORTEX_COLORS.aiAccentViolet }]} />
          <Text style={[VORTEX_TYPOGRAPHY.badgeText, { color: VORTEX_COLORS.aiAccentViolet }]}>
            {title}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.chipBtn} onPress={handleCopy}>
            <Text style={[styles.chipBtnText, { color: copied ? VORTEX_COLORS.aiAccentEmerald : '#EDE9FE' }]}>
              {copied ? 'COPIED' : 'COPY'}
            </Text>
          </TouchableOpacity>
          {onExecutePrompt && (
            <TouchableOpacity
              style={[styles.chipBtn, { borderColor: VORTEX_COLORS.aiAccentViolet }]}
              onPress={() => onExecutePrompt(clean)}
            >
              <Text style={[styles.chipBtnText, { color: VORTEX_COLORS.aiAccentViolet }]}>RUN</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={{ padding: 16 }}>
        <Text selectable style={VORTEX_TYPOGRAPHY.promptBlockText}>
          {clean}
        </Text>
      </View>
    </View>
  );
};

function parseDiagramSpec(raw: string): ParsedDiagram {
  const trimmed = raw.trim();
  const palette = ['#38BDF8', '#34D399', '#A78BFA', '#FBBF24', '#FB7185', '#60A5FA'];

  try {
    if (trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
      const rawEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
      const nodes: DiagramNode[] = rawNodes.map((n: any, idx: number) => ({
        id: String(n.id || `N${idx}`),
        label: String(n.label || n.id || `Step ${idx + 1}`).slice(0, 26),
        x: typeof n.x === 'number' ? n.x : 180,
        y: typeof n.y === 'number' ? n.y : 55 + idx * 96,
        w: 190,
        h: 48,
        shape: n.shape === 'diamond' ? 'diamond' : n.shape === 'circle' ? 'circle' : 'rect',
        color: palette[idx % palette.length],
      }));
      const edges: DiagramEdge[] = rawEdges.map((e: any) => ({
        from: String(e.from),
        to: String(e.to),
        label: e.label ? String(e.label).slice(0, 16) : undefined,
      }));
      const maxY = nodes.reduce((m, n) => Math.max(m, n.y + n.h + 40), 220);
      const maxX = nodes.reduce((m, n) => Math.max(m, n.x + n.w / 2 + 40), 360);
      return {
        title: String(parsed.title || 'SYSTEM DIAGRAM'),
        nodes,
        edges,
        width: Math.max(360, maxX),
        height: Math.max(220, maxY),
      };
    }
  } catch {}

  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('graph ') && !l.startsWith('flowchart '));

  const nodeMap = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];

  const getOrCreateNode = (token: string): DiagramNode => {
    const cleanToken = token.trim();
    const match = cleanToken.match(/^([a-zA-Z0-9_]+)\s*(?:\[(.*?)\]|\{(.*?)\}|\((.*?)\))?$/);
    const id = match?.[1] || cleanToken.replace(/[^a-zA-Z0-9_]/g, '_') || `N${nodeMap.size}`;
    const label = (match?.[2] || match?.[3] || match?.[4] || id).slice(0, 26);
    const shape: 'rect' | 'diamond' | 'circle' = match?.[3]
      ? 'diamond'
      : match?.[4]
      ? 'circle'
      : 'rect';

    if (!nodeMap.has(id)) {
      const idx = nodeMap.size;
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      nodeMap.set(id, {
        id,
        label,
        x: nodeMap.size === 0 ? 185 : col === 0 ? 105 : 265,
        y: 50 + row * 96,
        w: 146,
        h: 46,
        shape,
        color: palette[idx % palette.length],
      });
    }
    return nodeMap.get(id)!;
  };

  for (const line of lines) {
    const arrowParts = line.split(/-->|->|==>/);
    if (arrowParts.length >= 2) {
      for (let i = 0; i < arrowParts.length - 1; i++) {
        let left = arrowParts[i].trim();
        let right = arrowParts[i + 1].trim();
        let edgeLabel: string | undefined;

        const labelMatch = right.match(/^\|(.*?)\|\s*(.+)$/);
        if (labelMatch) {
          edgeLabel = labelMatch[1].trim().slice(0, 14);
          right = labelMatch[2].trim();
        }
        const n1 = getOrCreateNode(left);
        const n2 = getOrCreateNode(right);
        edges.push({ from: n1.id, to: n2.id, label: edgeLabel });
      }
    } else {
      getOrCreateNode(line);
    }
  }

  const nodes = Array.from(nodeMap.values());
  if (nodes.length <= 5) {
    nodes.forEach((n, idx) => {
      n.x = 185;
      n.y = 48 + idx * 92;
      n.w = 210;
    });
  }

  const maxY = nodes.reduce((m, n) => Math.max(m, n.y + 60), 220);
  return {
    title: 'VISUAL FLOW & ARCHITECTURE DIAGRAM',
    nodes,
    edges,
    width: 370,
    height: Math.max(220, maxY),
  };
}

export const VortexDiagramBox: React.FC<{ spec: string }> = ({ spec }) => {
  const [zoomed, setZoomed] = useState(false);
  const diagram = useMemo(() => parseDiagramSpec(spec), [spec]);

  const renderSvgCanvas = (scaleMultiplier: number) => {
    const w = diagram.width * scaleMultiplier;
    const h = diagram.height * scaleMultiplier;
    const nodeLookup = new Map(diagram.nodes.map((n) => [n.id, n]));

    return (
      <Svg width={w} height={h} viewBox={`0 0 ${diagram.width} ${diagram.height}`}>
        {diagram.edges.map((edge, idx) => {
          const from = nodeLookup.get(edge.from);
          const to = nodeLookup.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x;
          const y1 = from.y + from.h / 2;
          const x2 = to.x;
          const y2 = to.y - to.h / 2;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          return (
            <G key={`e-${idx}`}>
              <Line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#38BDF8"
                strokeWidth="2.2"
              />
              <Polygon
                points={`${x2},${y2} ${x2 - 5},${y2 - 9} ${x2 + 5},${y2 - 9}`}
                fill="#38BDF8"
              />
              {edge.label ? (
                <SvgText
                  x={midX + 6}
                  y={midY}
                  fill="#FBBF24"
                  fontSize="11"
                  fontWeight="bold"
                >
                  {edge.label}
                </SvgText>
              ) : null}
            </G>
          );
        })}

        {diagram.nodes.map((node) => {
          const left = node.x - node.w / 2;
          const top = node.y - node.h / 2;
          return (
            <G key={node.id}>
              {node.shape === 'circle' ? (
                <Circle
                  cx={node.x}
                  cy={node.y}
                  r={node.h / 2 + 4}
                  fill="#0B1626"
                  stroke={node.color}
                  strokeWidth="2.2"
                />
              ) : node.shape === 'diamond' ? (
                <Polygon
                  points={`${node.x},${top - 4} ${left + node.w + 6},${node.y} ${node.x},${top + node.h + 4} ${left - 6},${node.y}`}
                  fill="#17122B"
                  stroke={node.color}
                  strokeWidth="2.2"
                />
              ) : (
                <Rect
                  x={left}
                  y={top}
                  width={node.w}
                  height={node.h}
                  rx={12}
                  ry={12}
                  fill="#0B1626"
                  stroke={node.color}
                  strokeWidth="2.2"
                />
              )}
              <SvgText
                x={node.x}
                y={node.y + 4}
                fill="#F8FAFC"
                fontSize="12.5"
                fontWeight="bold"
                textAnchor="middle"
              >
                {node.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    );
  };

  return (
    <View style={VORTEX_BOX_STYLES.diagramBox}>
      <View style={[styles.boxHeader, { backgroundColor: VORTEX_COLORS.diagramBoxHeader }]}>
        <View style={styles.langPill}>
          <View style={[styles.dot, { backgroundColor: VORTEX_COLORS.aiAccentEmerald }]} />
          <Text style={[VORTEX_TYPOGRAPHY.badgeText, { color: VORTEX_COLORS.aiAccentEmerald }]}>
            {diagram.title}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.chipBtn, { borderColor: VORTEX_COLORS.aiAccentEmerald }]}
          onPress={() => setZoomed(true)}
        >
          <Text style={[styles.chipBtnText, { color: VORTEX_COLORS.aiAccentEmerald }]}>ZOOM</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', padding: 10 }}>
        {renderSvgCanvas(0.95)}
      </ScrollView>

      <Modal visible={zoomed} transparent animationType="fade" onRequestClose={() => setZoomed(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.zoomCard}>
            <View style={styles.boxHeader}>
              <Text style={[VORTEX_TYPOGRAPHY.subHeading, { color: VORTEX_COLORS.aiHeadingCyan }]}>
                {diagram.title}
              </Text>
              <TouchableOpacity style={styles.chipBtn} onPress={() => setZoomed(false)}>
                <Text style={styles.chipBtnText}>CLOSE</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal>
              <ScrollView contentContainerStyle={{ padding: 16 }}>
                {renderSvgCanvas(1.25)}
              </ScrollView>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export const VortexWebImageStrip: React.FC<{
  images: WebImageResult[];
  onOpenGhostUrl?: (url: string) => void;
}> = ({ images, onOpenGhostUrl }) => {
  const [previewImg, setPreviewImg] = useState<WebImageResult | null>(null);
  if (!images || images.length === 0) return null;

  return (
    <View style={{ marginVertical: 10 }}>
      <Text style={[VORTEX_TYPOGRAPHY.badgeText, { color: VORTEX_COLORS.aiHeadingCyan, marginBottom: 8 }]}>
        VERIFIED WEB VISUALS ({images.length})
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {images.map((item, idx) => (
          <TouchableOpacity
            key={`${item.imageUrl}-${idx}`}
            style={styles.webImgCard}
            onPress={() => setPreviewImg(item)}
          >
            <Image source={{ uri: item.imageUrl }} style={styles.webImgThumb} resizeMode="cover" />
            <Text numberOfLines={2} style={styles.webImgCaption}>
              {item.title}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={!!previewImg} transparent animationType="fade" onRequestClose={() => setPreviewImg(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.zoomCard}>
            {previewImg && (
              <>
                <Image
                  source={{ uri: previewImg.imageUrl }}
                  style={{ width: '100%', height: 300, borderRadius: 14, backgroundColor: '#050811' }}
                  resizeMode="contain"
                />
                <Text style={[VORTEX_TYPOGRAPHY.subHeading, { marginTop: 12 }]}>{previewImg.title}</Text>
                <View style={[styles.headerActions, { marginTop: 14 }]}>
                  {onOpenGhostUrl && (
                    <TouchableOpacity
                      style={[styles.chipBtn, { borderColor: VORTEX_COLORS.aiHeadingCyan }]}
                      onPress={() => {
                        const u = previewImg.sourceUrl;
                        setPreviewImg(null);
                        onOpenGhostUrl(u);
                      }}
                    >
                      <Text style={[styles.chipBtnText, { color: VORTEX_COLORS.aiHeadingCyan }]}>
                        OPEN IN GHOST WEB
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.chipBtn} onPress={() => setPreviewImg(null)}>
                    <Text style={styles.chipBtnText}>CLOSE</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export const VortexVerifiedLinksList: React.FC<{
  links: VerifiedWebLink[];
  onOpenGhostUrl?: (url: string) => void;
}> = ({ links, onOpenGhostUrl }) => {
  if (!links || links.length === 0) return null;

  return (
    <View style={{ marginVertical: 10 }}>
      <Text style={[VORTEX_TYPOGRAPHY.badgeText, { color: VORTEX_COLORS.aiAccentEmerald, marginBottom: 8 }]}>
        LIVE-VISITED & VERIFIED SOURCES ({links.length})
      </Text>
      {links.map((link, idx) => (
        <View key={`${link.url}-${idx}`} style={VORTEX_BOX_STYLES.verifiedLinkBox}>
          <View style={styles.linkTopRow}>
            <View style={styles.verifiedPill}>
              <Text style={[styles.chipBtnText, { color: VORTEX_COLORS.aiAccentEmerald }]}>
                {link.readViaGhost ? 'GHOST READ • 200 OK' : `VERIFIED • ${link.httpStatus || 200}`}
              </Text>
            </View>
            <Text style={styles.domainLabel}>{link.domain}</Text>
          </View>

          <Text style={[VORTEX_TYPOGRAPHY.subHeading, { color: '#F8FAFC', marginTop: 6 }]}>
            {link.title}
          </Text>
          <Text numberOfLines={3} style={styles.linkSnippet}>
            {link.snippet}
          </Text>

          <View style={[styles.headerActions, { marginTop: 10 }]}>
            {onOpenGhostUrl && (
              <TouchableOpacity
                style={[styles.chipBtn, { borderColor: VORTEX_COLORS.aiAccentViolet }]}
                onPress={() => onOpenGhostUrl(link.url)}
              >
                <Text style={[styles.chipBtnText, { color: VORTEX_COLORS.aiAccentViolet }]}>
                  GHOST VIEW
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.chipBtn, { borderColor: VORTEX_COLORS.aiAccentEmerald }]}
              onPress={() => Linking.openURL(link.url)}
            >
              <Text style={[styles.chipBtnText, { color: VORTEX_COLORS.aiAccentEmerald }]}>
                OPEN LINK
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
};

export const VortexAiImageCard: React.FC<{
  image: GeneratedAiImage;
  onRemixPrompt?: (prompt: string) => void;
}> = ({ image, onRemixPrompt }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const baseDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
      const dest = `${baseDir}vortex_ai_${Date.now()}.jpg`;
      await FileSystem.downloadAsync(image.imageUrl, dest);
      Alert.alert('Saved', `HD Image saved to app storage:\n${dest}`);
    } catch (e: any) {
      Alert.alert('Save Error', e?.message || 'Could not download image.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={VORTEX_BOX_STYLES.aiImageBox}>
      <View style={[styles.boxHeader, { backgroundColor: '#1E1430' }]}>
        <View style={styles.langPill}>
          <View style={[styles.dot, { backgroundColor: VORTEX_COLORS.aiAccentViolet }]} />
          <Text style={[VORTEX_TYPOGRAPHY.badgeText, { color: VORTEX_COLORS.aiAccentViolet }]}>
            AI STUDIO • {image.model.toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.chipBtn} onPress={handleSave} disabled={saving}>
            <Text style={[styles.chipBtnText, { color: VORTEX_COLORS.aiAccentEmerald }]}>
              {saving ? 'SAVING...' : 'SAVE HD'}
            </Text>
          </TouchableOpacity>
          {onRemixPrompt && (
            <TouchableOpacity
              style={[styles.chipBtn, { borderColor: VORTEX_COLORS.aiAccentViolet }]}
              onPress={() => onRemixPrompt(image.prompt)}
            >
              <Text style={[styles.chipBtnText, { color: VORTEX_COLORS.aiAccentViolet }]}>REMIX</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={{ width: '100%', height: SCREEN_W - 44, backgroundColor: '#070910', justifyContent: 'center', alignItems: 'center' }}>
        {loading && <ActivityIndicator size="large" color={VORTEX_COLORS.aiAccentViolet} style={{ position: 'absolute' }} />}
        <Image
          source={{ uri: image.imageUrl }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
          onLoadEnd={() => setLoading(false)}
        />
      </View>

      <View style={{ padding: 12 }}>
        <Text style={{ color: '#CBD5E1', fontSize: 13.5, fontFamily: VORTEX_FONTS.sansBody }}>
          Prompt: <Text style={{ color: '#F8FAFC', fontWeight: '600' }}>{image.prompt}</Text>
        </Text>
      </View>
    </View>
  );
};

function renderFormattedInline(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={idx} style={VORTEX_TYPOGRAPHY.aiBoldHighlight}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <Text key={idx} style={VORTEX_TYPOGRAPHY.aiInlineCode}>
          {` ${part.slice(1, -1)} `}
        </Text>
      );
    }
    return <Text key={idx}>{part}</Text>;
  });
}

export const VortexRichMessageRenderer: React.FC<{
  content: string;
  webImages?: WebImageResult[];
  verifiedLinks?: VerifiedWebLink[];
  generatedImage?: GeneratedAiImage;
  onExecutePrompt?: (cmd: string) => void;
  onOpenGhostUrl?: (url: string) => void;
  onRemixImage?: (prompt: string) => void;
}> = ({
  content,
  webImages,
  verifiedLinks,
  generatedImage,
  onExecutePrompt,
  onOpenGhostUrl,
  onRemixImage,
}) => {
  const segments = useMemo(() => {
    const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const out: Array<{ type: 'text' | 'fence'; lang?: string; body: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        out.push({ type: 'text', body: content.slice(lastIndex, match.index) });
      }
      out.push({
        type: 'fence',
        lang: (match[1] || 'text').toLowerCase(),
        body: match[2],
      });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      out.push({ type: 'text', body: content.slice(lastIndex) });
    }
    return out;
  }, [content]);

  return (
    <View style={VORTEX_BOX_STYLES.aiResponseContainer}>
      {webImages && webImages.length > 0 && (
        <VortexWebImageStrip images={webImages} onOpenGhostUrl={onOpenGhostUrl} />
      )}

      {generatedImage && (
        <VortexAiImageCard image={generatedImage} onRemixPrompt={onRemixImage} />
      )}

      {segments.map((seg, segIdx) => {
        if (seg.type === 'fence') {
          if (seg.lang === 'diagram' || seg.lang === 'mermaid') {
            return <VortexDiagramBox key={segIdx} spec={seg.body} />;
          }
          if (seg.lang === 'prompt' || seg.lang === 'command' || seg.lang === 'macro') {
            return (
              <VortexPromptBox
                key={segIdx}
                title={seg.lang === 'macro' ? 'AUTONOMOUS MACRO' : 'AI PROMPT / COMMAND'}
                promptText={seg.body}
                onExecutePrompt={onExecutePrompt}
              />
            );
          }
          return <VortexCodeBox key={segIdx} language={seg.lang || 'CODE'} code={seg.body} />;
        }

        const lines = seg.body.split('\n');
        return (
          <View key={segIdx}>
            {lines.map((line, lIdx) => {
              const t = line.trim();
              if (!t) return <View key={lIdx} style={{ height: 8 }} />;

              if (t.startsWith('## ')) {
                return (
                  <Text key={lIdx} style={VORTEX_TYPOGRAPHY.sectionTitle}>
                    {t.replace(/^##\s+/, '')}
                  </Text>
                );
              }
              if (t.startsWith('### ')) {
                return (
                  <Text key={lIdx} style={VORTEX_TYPOGRAPHY.subHeading}>
                    {t.replace(/^###\s+/, '')}
                  </Text>
                );
              }
              if (t.startsWith('* ') || t.startsWith('- ')) {
                return (
                  <View key={lIdx} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>◆</Text>
                    <Text style={[VORTEX_TYPOGRAPHY.aiBodyText, { flex: 1 }]}>
                      {renderFormattedInline(t.slice(2))}
                    </Text>
                  </View>
                );
              }
              const numMatch = t.match(/^(\d+\.)\s+(.*)$/);
              if (numMatch) {
                return (
                  <View key={lIdx} style={styles.bulletRow}>
                    <Text style={styles.numberBadge}>{numMatch[1]}</Text>
                    <Text style={[VORTEX_TYPOGRAPHY.aiBodyText, { flex: 1 }]}>
                      {renderFormattedInline(numMatch[2])}
                    </Text>
                  </View>
                );
              }
              return (
                <Text key={lIdx} style={VORTEX_TYPOGRAPHY.aiBodyText}>
                  {renderFormattedInline(line)}
                </Text>
              );
            })}
          </View>
        );
      })}

      {verifiedLinks && verifiedLinks.length > 0 && (
        <VortexVerifiedLinksList links={verifiedLinks} onOpenGhostUrl={onOpenGhostUrl} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  boxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: VORTEX_COLORS.codeBoxHeader,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#E2E8F0',
  },
  codeScrollPad: {
    padding: 14,
  },
  codeLineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  lineNumber: {
    width: 28,
    fontSize: 13,
    fontFamily: VORTEX_FONTS.mono,
    color: '#475569',
    marginRight: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 4,
    paddingLeft: 4,
  },
  bulletDot: {
    color: VORTEX_COLORS.aiHeadingCyan,
    fontSize: 14,
    marginRight: 10,
    marginTop: 6,
  },
  numberBadge: {
    color: VORTEX_COLORS.aiAccentEmerald,
    fontSize: 16,
    fontWeight: '800',
    marginRight: 10,
    marginTop: 2,
  },
  webImgCard: {
    width: 165,
    backgroundColor: '#0B111E',
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: '#1E3A5F',
    marginRight: 10,
    overflow: 'hidden',
  },
  webImgThumb: {
    width: '100%',
    height: 112,
    backgroundColor: '#060912',
  },
  webImgCaption: {
    color: '#E2E8F0',
    fontSize: 12.5,
    fontWeight: '600',
    padding: 8,
  },
  linkTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verifiedPill: {
    backgroundColor: '#06261C',
    borderColor: '#059669',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  domainLabel: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontWeight: '700',
  },
  linkSnippet: {
    color: '#CBD5E1',
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    padding: 16,
  },
  zoomCard: {
    backgroundColor: '#090E1A',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    padding: 14,
    maxHeight: '85%',
  },
});
            
