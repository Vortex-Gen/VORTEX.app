# VORTEX ẞ

**Autonomous OS-Level AI Intelligence for Android**

VORTEX ẞ is a modular, hands-free Android assistant built on a native Kotlin accessibility bridge and a multi-agent TypeScript neural core. Designed with Golden Ratio ($\phi = 1.618$) geometric proportions and a zero-clutter dark command interface, it operates across all installed applications via a 24/7 background wakeword engine and an interactive floating glass capsule.

---

## System Architecture

```text
+-----------------------------------------------------------------------+
|                        VORTEX ẞ COMMAND COCKPIT                       |
|            (CORE  |  SYSTEM  |  VAULT  |  MEMORY  |  HUD)             |
+-----------------------------------+-----------------------------------+
                                    |
                    +---------------+---------------+
                    |   PRO INTENT & WAKE ROUTER    |
                    |     (vortexProRouter.ts)      |
                    +---------------+---------------+
                                    |
        +---------------------------+---------------------------+
        |                           |                           |
+-------v-------+           +-------v-------+           +-------v-------+
| VISION & CODE |           | VAULT & POWER |           | MEMORY & OPT  |
| Silent Screen |           | App-Lock Auto |           | SQLite Brain  |
| Code Injector |           | Credential DB |           | Key Rotator   |
| Observe->Act  |           | Lock / Wake   |           | 3-Layer Clean |
+-------+-------+           +-------+-------+           +-------+-------+
        |                           |                           |
        +---------------------------+---------------------------+
                                    |
                    +---------------v---------------+
                    |   NATIVE KOTLIN OS BRIDGE     |
                    |  VortexAccessibilityService   |
                    |  VortexFloatingService (24/7) |
                    +-------------------------------+
