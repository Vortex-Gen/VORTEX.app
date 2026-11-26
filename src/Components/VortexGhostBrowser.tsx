import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { VORTEX_COLORS, VORTEX_TYPOGRAPHY } from '../theme/vortexTheme';

export interface GhostPageSnapshot {
  url: string;
  title: string;
  textContent: string;
  links: Array<{ text: string; href: string }>;
  inputs: Array<{ id: string; name: string; placeholder: string; type: string }>;
}

type GhostActionFn = {
  openUrl: (url: string, showModal?: boolean) => Promise<GhostPageSnapshot>;
  extractSnapshot: () => Promise<GhostPageSnapshot>;
  humanScroll: (direction: 'DOWN' | 'UP') => Promise<boolean>;
  clickByText: (targetText: string) => Promise<boolean>;
  typeAndSubmit: (queryOrPlaceholder: string, value: string, submitAfter?: boolean) => Promise<boolean>;
  showModalWithUrl: (url?: string) => void;
};

class GhostBrowserController {
  private handler: GhostActionFn | null = null;

  register(fn: GhostActionFn | null) {
    this.handler = fn;
  }

  async openUrl(url: string, showModal = false): Promise<GhostPageSnapshot> {
    if (!this.handler) {
      return { url, title: url, textContent: '', links: [], inputs: [] };
    }
    return this.handler.openUrl(url, showModal);
  }

  async extractSnapshot(): Promise<GhostPageSnapshot> {
    if (!this.handler) {
      return { url: '', title: '', textContent: '', links: [], inputs: [] };
    }
    return this.handler.extractSnapshot();
  }

  async humanScroll(direction: 'DOWN' | 'UP'): Promise<boolean> {
    return (await this.handler?.humanScroll(direction)) ?? false;
  }

  async clickByText(targetText: string): Promise<boolean> {
    return (await this.handler?.clickByText(targetText)) ?? false;
  }

  async typeAndSubmit(queryOrPlaceholder: string, value: string, submitAfter = true): Promise<boolean> {
    return (await this.handler?.typeAndSubmit(queryOrPlaceholder, value, submitAfter)) ?? false;
  }

  showModal(url?: string) {
    this.handler?.showModalWithUrl(url);
  }
}

export const ghostBrowserController = new GhostBrowserController();

const MOBILE_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Redmi Note 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

const EXTRACT_DOM_JS = `
(function() {
  try {
    var title = document.title || '';
    var clone = document.body ? document.body.cloneNode(true) : null;
    if (clone) {
      var bad = clone.querySelectorAll('script, style, noscript, iframe, svg');
      bad.forEach(function(el) { el.remove(); });
    }
    var rawText = clone ? (clone.innerText || clone.textContent || '') : '';
    var cleanText = rawText.replace(/\\s+/g, ' ').trim().slice(0, 7500);

    var anchors = Array.from(document.querySelectorAll('a[href]')).slice(0, 35).map(function(a) {
      return {
        text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 80),
        href: a.href
      };
    }).filter(function(item) { return item.href && item.href.startsWith('http') && item.text.length > 1; });

    var inputs = Array.from(document.querySelectorAll('input, textarea')).slice(0, 15).map(function(inp) {
      return {
        id: inp.id || '',
        name: inp.name || '',
        placeholder: inp.placeholder || '',
        type: inp.type || 'text'
      };
    });

    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'SNAPSHOT',
      payload: {
        url: window.location.href,
        title: title,
        textContent: cleanText,
        links: anchors,
        inputs: inputs
      }
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'SNAPSHOT',
      payload: { url: window.location.href, title: '', textContent: '', links: [], inputs: [] }
    }));
  }
})();
true;
`;

export const VortexGhostBrowserHost: React.FC = () => {
  const webRef = useRef<WebView>(null);
  const [visible, setVisible] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('https://duckduckgo.com');
  const [urlBarText, setUrlBarText] = useState('https://duckduckgo.com');
  const [loading, setLoading] = useState(false);
  const [statusLabel, setStatusLabel] = useState('GHOST WEB IDLE');

  const pendingSnapshotResolve = useRef<((snap: GhostPageSnapshot) => void) | null>(null);
  const loadDoneResolve = useRef<(() => void) | null>(null);

  const requestDomSnapshot = (): Promise<GhostPageSnapshot> => {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingSnapshotResolve.current = null;
        resolve({ url: currentUrl, title: currentUrl, textContent: '', links: [], inputs: [] });
      }, 4500);

      pendingSnapshotResolve.current = (snap) => {
        clearTimeout(timer);
        resolve(snap);
      };
      webRef.current?.injectJavaScript(EXTRACT_DOM_JS);
    });
  };

  useEffect(() => {
    ghostBrowserController.register({
      openUrl: async (url: string, showModal = false) => {
        const normalized = url.startsWith('http') ? url : `https://${url}`;
        setCurrentUrl(normalized);
        setUrlBarText(normalized);
        setStatusLabel('NAVIGATING LIKE HUMAN...');
        if (showModal) setVisible(true);

        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            loadDoneResolve.current = null;
            resolve();
          }, 7500);
          loadDoneResolve.current = () => {
            clearTimeout(timer);
            resolve();
          };
        });

        // Human-like subtle scroll after page load to trigger lazy content
        webRef.current?.injectJavaScript(`
          window.scrollBy({ top: Math.floor(140 + Math.random() * 180), behavior: 'smooth' });
          true;
        `);
        await new Promise((r) => setTimeout(r, 650));
        setStatusLabel('READING PAGE DOM');
        const snap = await requestDomSnapshot();
        setStatusLabel('GHOST READY');
        return snap;
      },

      extractSnapshot: async () => {
        return await requestDomSnapshot();
      },

      humanScroll: async (direction: 'DOWN' | 'UP') => {
        const delta = direction === 'DOWN' ? 420 + Math.floor(Math.random() * 180) : -420;
        webRef.current?.injectJavaScript(`
          window.scrollBy({ top: ${delta}, behavior: 'smooth' });
          true;
        `);
        return true;
      },

      clickByText: async (targetText: string) => {
        const escaped = JSON.stringify(targetText.toLowerCase());
        webRef.current?.injectJavaScript(`
          (function() {
            var q = ${escaped};
            var nodes = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="submit"]'));
            var hit = nodes.find(function(el) {
              var t = (el.innerText || el.value || el.getAttribute('aria-label') || '').toLowerCase();
              return t.includes(q);
            });
            if (hit) {
              hit.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setTimeout(function() { hit.click(); }, 280);
            }
          })();
          true;
        `);
        return true;
      },

      typeAndSubmit: async (queryOrPlaceholder: string, value: string, submitAfter = true) => {
        const qEsc = JSON.stringify(queryOrPlaceholder.toLowerCase());
        const vEsc = JSON.stringify(value);
        webRef.current?.injectJavaScript(`
          (function() {
            var q = ${qEsc};
            var val = ${vEsc};
            var inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), textarea'));
            var target = inputs.find(function(el) {
              var meta = (el.placeholder + ' ' + el.name + ' ' + el.id + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
              return !q || meta.includes(q);
            }) || inputs[0];
            if (target) {
              target.focus();
              target.value = val;
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.dispatchEvent(new Event('change', { bubbles: true }));
              if (${submitAfter ? 'true' : 'false'}) {
                setTimeout(function() {
                  if (target.form) target.form.submit();
                  else target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
                }, 360);
              }
            }
          })();
          true;
        `);
        return true;
      },

      showModalWithUrl: (url?: string) => {
        if (url) {
          const normalized = url.startsWith('http') ? url : `https://${url}`;
          setCurrentUrl(normalized);
          setUrlBarText(normalized);
        }
        setVisible(true);
      },
    });

    return () => ghostBrowserController.register(null);
  }, [currentUrl]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'SNAPSHOT' && pendingSnapshotResolve.current) {
        const fn = pendingSnapshotResolve.current;
        pendingSnapshotResolve.current = null;
        fn(msg.payload);
      }
    } catch {}
  };

  const webViewNode = (
    <WebView
      ref={webRef}
      source={{ uri: currentUrl }}
      userAgent={MOBILE_CHROME_UA}
      javaScriptEnabled
      domStorageEnabled
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      onLoadStart={() => setLoading(true)}
      onLoadEnd={() => {
        setLoading(false);
        if (loadDoneResolve.current) {
          const fn = loadDoneResolve.current;
          loadDoneResolve.current = null;
          fn();
        }
      }}
      onMessage={handleMessage}
      style={{ flex: 1, backgroundColor: '#050811' }}
    />
  );

  return (
    <>
      {!visible && (
        <View style={styles.hiddenHost} pointerEvents="none">
          {webViewNode}
        </View>
      )}

      <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalRoot}>
          <View style={styles.topBar}>
            <View style={{ flex: 1 }}>
              <Text style={[VORTEX_TYPOGRAPHY.badgeText, { color: VORTEX_COLORS.aiAccentViolet }]}>
                {statusLabel}
              </Text>
              <TextInput
                value={urlBarText}
                onChangeText={setUrlBarText}
                onSubmitEditing={() => {
                  const u = urlBarText.startsWith('http') ? urlBarText : `https://${urlBarText}`;
                  setCurrentUrl(u);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.urlInput}
                placeholder="Enter URL..."
                placeholderTextColor="#64748B"
              />
            </View>
            {loading && <ActivityIndicator color={VORTEX_COLORS.aiHeadingCyan} style={{ marginHorizontal: 8 }} />}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
              <Text style={styles.closeBtnText}>HIDE</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>{visible ? webViewNode : null}</View>

          <View style={styles.bottomControls}>
            <TouchableOpacity style={styles.ctrlBtn} onPress={() => webRef.current?.goBack()}>
              <Text style={styles.ctrlText}>BACK</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.ctrlBtn}
              onPress={() => ghostBrowserController.humanScroll('DOWN')}
            >
              <Text style={styles.ctrlText}>HUMAN SCROLL</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ctrlBtn} onPress={() => webRef.current?.reload()}>
              <Text style={styles.ctrlText}>RELOAD</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  hiddenHost: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    left: -10,
    top: -10,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: 38,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#080C15',
  },
  urlInput: {
    marginTop: 4,
    backgroundColor: '#111827',
    color: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13.5,
    borderWidth: 1,
    borderColor: '#334155',
  },
  closeBtn: {
    marginLeft: 10,
    backgroundColor: '#1E1B4B',
    borderColor: '#7C3AED',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  closeBtnText: {
    color: '#DDD6FE',
    fontWeight: '800',
    fontSize: 12,
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: '#080C15',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  ctrlBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  ctrlText: {
    color: '#38BDF8',
    fontWeight: '800',
    fontSize: 12.5,
  },
});        
