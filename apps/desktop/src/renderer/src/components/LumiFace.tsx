import { createContext, useContext } from "react";
import { DEFAULT_AVATAR, bodyOf, hexOf, showsAntenna, type AvatarConfig } from "@lumi/shared";

export type Mood = "reposo" | "pendientes" | "hablando" | "reunion" | "pensando" | "arrastrando" | "concentrada";

/** El look que usan todos los LumiFace de una ventana (se provee en la raíz). */
export const AvatarLook = createContext<AvatarConfig>(DEFAULT_AVATAR);

interface Props {
  size?: number;
  mood?: Mood;
  shadow?: boolean;
  title?: string;
  /** Para vistas previas: si no se pasa, usa el look guardado. */
  look?: AvatarConfig;
}

const INK = "#1B1D33";
const SHADE = { fill: "#000", fillOpacity: 0.2 } as const;
const round = { strokeLinecap: "round", strokeLinejoin: "round" } as const;
/** Media esfera de abajo: la zona donde vive la ropa. */
const LOWER = "M48.2 146 A62 62 0 0 0 151.8 146 Z";
const MUSTACHE = "M90 120 C94 116 99 117 100 120 C101 117 106 116 110 120 C106 123 102 122 100 121 C98 122 94 123 90 120 Z";

/** Lumi: una esferita que flota, con su ropa, cabello y accesorios. */
export function LumiFace({ size = 84, mood = "reposo", shadow = false, title, look }: Props) {
  const ctx = useContext(AvatarLook);
  const a = look ?? ctx;
  const b = bodyOf(a.cuerpo);
  const body = b.hex;
  const light = b.light;
  const iris = hexOf.eyes(a.ojos);
  // Ropa blanca: un borde suave para que no se pierda; detalles oscuros sobre ropa clara
  const edge = a.prendaColor === "blanco" ? { stroke: INK, strokeOpacity: 0.15, strokeWidth: 1.5 } : {};
  const onCloth = ["blanco", "mostaza", "menta", "naranja"].includes(a.prendaColor) ? INK : "#fff";
  const hair = hexOf.hair(a.cabelloColor);
  const cloth = hexOf.color(a.prendaColor);
  const acc = hexOf.color(a.accesorioColor);
  const frame = hexOf.frame(a.lentesColor);
  const feature = light ? INK : "#fff"; // boca y ojos cerrados
  const tilt = mood === "arrastrando" ? "rotate(-8 100 112) translate(0 -6)" : undefined;
  const lookUp = mood === "pendientes" || mood === "pensando";
  const wide = mood === "reunion" || mood === "arrastrando";
  const showBrows = light || a.cabello !== "ninguno";

  const eye = (cx: number) => {
    if (mood === "hablando") {
      return <path key={cx} d={`M${cx - 7} 110 Q${cx} 101 ${cx + 7} 110`} stroke={feature} strokeWidth={4} fill="none" {...round} />;
    }
    const dy = lookUp ? -3 : mood === "arrastrando" ? 3 : mood === "concentrada" ? 2.5 : 0;
    const dx = lookUp ? 2 : 0;
    const k = wide ? 1.08 : 1;
    // Todos con los ojos de la Lumi clásica: blanco grande, iris de color, pupila y brillo
    return (
      <g key={cx}>
        <ellipse cx={cx} cy={108} rx={8.6 * k} ry={10.6 * k} fill="#fff" stroke={INK} strokeOpacity={light ? 0.16 : 0} strokeWidth={1.5} />
        <circle cx={cx + 1 + dx} cy={109.5 + dy} r={5.6} fill={iris} />
        <circle cx={cx + 1 + dx} cy={109.5 + dy} r={2.8} fill={INK} />
        <circle cx={cx + 3.2 + dx} cy={106.6 + dy} r={1.9} fill="#fff" />
      </g>
    );
  };

  let mouth: JSX.Element;
  if (mood === "hablando") mouth = <ellipse cx={100} cy={128} rx={8} ry={6} fill={INK} />;
  else if (mood === "reunion") mouth = <ellipse cx={100} cy={130} rx={4.5} ry={4} fill={feature} />;
  else if (mood === "arrastrando") mouth = <ellipse cx={100} cy={130} rx={5} ry={6.5} fill={INK} />;
  else if (mood === "pensando") mouth = <path d="M93 128h14" stroke={feature} strokeWidth={3.5} fill="none" {...round} />;
  else if (mood === "concentrada") mouth = <path d="M95 127 Q100 130.5 105 127" stroke={feature} strokeWidth={3.5} fill="none" {...round} />;
  else mouth = <path d="M93 125 Q100 132 107 125" stroke={feature} strokeWidth={3.5} fill="none" {...round} />;

  return (
    <svg width={size} height={size} viewBox="8 16 184 184" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {mood === "reunion" && <circle cx={100} cy={112} r={80} fill="none" stroke="#F4B740" strokeWidth={5} strokeDasharray="9 11" />}
      {/* sesión de estudio: un aro de puntitos menta */}
      {mood === "concentrada" && <circle cx={100} cy={112} r={80} fill="none" stroke="#4CC2AE" strokeWidth={5} strokeDasharray="1 11" strokeLinecap="round" />}
      {shadow && mood !== "reunion" && mood !== "concentrada" && (
        <ellipse cx={100} cy={192} rx={mood === "arrastrando" ? 28 : 40} ry={mood === "arrastrando" ? 4 : 6} fill="#0B0C1A" opacity={0.22} />
      )}
      <g transform={tilt}>
        {/* detrás: capa */}
        {a.prenda === "capa" && (
          <>
            <path d="M34 108 C24 168 60 194 100 194 C140 194 176 168 166 108 Z" fill={cloth} />
            <path d="M34 108 C24 168 60 194 100 194 C140 194 176 168 166 108 Z" {...SHADE} />
          </>
        )}

        {/* antena de la Lumi clásica (va detrás de la cabeza; los gorros la tapan) */}
        {showsAntenna(a) && (
          <>
            <path d="M100 54 C100 40 106 32 116 30" stroke="#8C88EC" strokeWidth={7} fill="none" {...round} />
            <circle cx={119} cy={29} r={8} fill="#F4B740" />
          </>
        )}

        {/* cuerpo */}
        <ellipse cx={40} cy={130} rx={9} ry={12} transform="rotate(-25 40 130)" fill={body} />
        <ellipse cx={160} cy={130} rx={9} ry={12} transform="rotate(25 160 130)" fill={body} />
        <circle cx={100} cy={112} r={62} fill={body} />
        <path d="M58 100 C58 84 66 72 78 64" fill="none" stroke="#fff" strokeOpacity={light ? 0.4 : 0.25} strokeWidth={6} {...round} />

        {/* prenda (solo la parte de abajo) */}
        {a.prenda === "playera" && (
          <>
            <path d={LOWER} fill={cloth} {...edge} />
            <rect x={106} y={152} width={14} height={10} rx={3} {...SHADE} />
          </>
        )}
        {a.prenda === "bufanda" && (
          <>
            <path d="M50 136 Q100 154 150 136 L152 146 Q100 166 48 146 Z" fill={cloth} />
            <path d="M118 150 L132 150 L128 176 L116 174 Z" fill={cloth} />
            <path d="M118 150 L132 150 L128 176 L116 174 Z" {...SHADE} />
          </>
        )}
        {a.prenda === "overol" && (
          <>
            <path d={LOWER} fill={cloth} {...edge} />
            <rect x={84} y={134} width={32} height={16} rx={4} fill={cloth} />
            <path d="M86 138 L56 132 M114 138 L144 132" stroke={cloth} strokeWidth={5} {...round} />
            <circle cx={89} cy={140} r={2.5} fill={INK} />
            <circle cx={111} cy={140} r={2.5} fill={INK} />
          </>
        )}
        {a.prenda === "rayas" && (
          <>
            <path d={LOWER} fill={cloth} {...edge} />
            <path d="M60 156 L140 156 M78 168 L122 168" stroke="#fff" strokeOpacity={0.9} strokeWidth={5} fill="none" {...round} />
          </>
        )}
        {a.prenda === "corbatin" && (
          <>
            <path d="M100 140 L86 132 L86 148 Z M100 140 L114 132 L114 148 Z" fill={cloth} />
            <circle cx={100} cy={140} r={4.5} fill={cloth} />
            <circle cx={100} cy={140} r={4.5} {...SHADE} />
          </>
        )}
        {a.prenda === "capa" && (
          <>
            <path d="M48 132 Q76 142 96 144 M152 132 Q124 142 104 144" fill="none" stroke={cloth} strokeWidth={3.5} {...round} />
            <circle cx={100} cy={144} r={5} fill="#E2A33B" />
          </>
        )}

        {a.prenda === "camisa" && (
          <>
            <path d={LOWER} fill={cloth} {...edge} />
            <path d="M100 151 L82 141 L86 157 Z M100 151 L118 141 L114 157 Z" fill="#fff" stroke={INK} strokeOpacity={0.15} strokeWidth={1.2} />
            <circle cx={100} cy={158} r={1.8} fill={onCloth} opacity={0.7} />
            <circle cx={100} cy={166} r={1.8} fill={onCloth} opacity={0.7} />
            <path d="M113 159 h12 v8 h-12 Z" fill="none" stroke="#000" strokeOpacity={0.2} strokeWidth={1.5} />
          </>
        )}
        {a.prenda === "corbata" && (
          <>
            <path d={LOWER} fill="#F7F6FC" stroke={INK} strokeOpacity={0.15} strokeWidth={1.5} />
            <path d="M100 150 L83 141 L87 156 Z M100 150 L117 141 L113 156 Z" fill="#fff" stroke={INK} strokeOpacity={0.2} strokeWidth={1.2} />
            <path d="M97.5 153 L102.5 153 L106 166 L100 172 L94 166 Z" fill={cloth} />
            <path d="M95.5 146 L104.5 146 L102.5 153 L97.5 153 Z" fill={cloth} />
            <path d="M95.5 146 L104.5 146 L102.5 153 L97.5 153 Z" {...SHADE} />
          </>
        )}
        {a.prenda === "jersey" && (
          <>
            <path d={LOWER} fill={cloth} {...edge} />
            <path d="M82 147 L100 158 L118 147" fill="none" stroke={onCloth} strokeWidth={4} {...round} />
            <text x={100} y={172} textAnchor="middle" fontSize={13} fontWeight={800} fontFamily="system-ui, sans-serif" fill={onCloth}>
              10
            </text>
          </>
        )}
        {a.prenda === "blusa" && (
          <>
            <path d={LOWER} fill={cloth} {...edge} />
            <path
              d="M100 148 C94 158 80 157 77 147 C85 142 94 142 100 148 Z M100 148 C106 158 120 157 123 147 C115 142 106 142 100 148 Z"
              fill="#fff"
              stroke={INK}
              strokeOpacity={0.12}
              strokeWidth={1.2}
            />
            <circle cx={100} cy={161} r={1.8} fill={onCloth} opacity={0.75} />
            <circle cx={100} cy={168} r={1.8} fill={onCloth} opacity={0.75} />
          </>
        )}
        {a.prenda === "vestido" && (
          <>
            <path d={LOWER} fill={cloth} {...edge} />
            <path d="M52.6 152 L147.4 152 L141.6 158 L58.4 158 Z" {...SHADE} />
            <path d="M100 155 L91 150 L91 160 Z M100 155 L109 150 L109 160 Z" fill="#fff" />
            <circle cx={100} cy={155} r={2.6} fill="#fff" />
            <path d="M80 161 L76 169 M100 162 L100 172 M120 161 L124 169" stroke="#000" strokeOpacity={0.15} strokeWidth={2} {...round} />
          </>
        )}
        {a.prenda === "bata" && (
          <>
            <path d={LOWER} fill="#fff" stroke={INK} strokeOpacity={0.15} strokeWidth={1.5} />
            <path d="M88 146.5 L100 165 L112 146.5 Z" fill={cloth} />
            <path d="M86 146.5 L100 166 L114 146.5" fill="none" stroke={INK} strokeOpacity={0.25} strokeWidth={2} {...round} />
            <rect x={114} y={156} width={12} height={9} rx={2} fill="none" stroke={INK} strokeOpacity={0.25} strokeWidth={1.5} />
            <path d="M118 152 L118 158" stroke={cloth} strokeWidth={2.5} {...round} />
            <circle cx={100} cy={170} r={1.6} fill={INK} opacity={0.3} />
          </>
        )}
        {a.prenda === "delantal" && (
          <>
            <path d="M74 147 L58 145 M126 147 L142 145" stroke={cloth} strokeWidth={3} {...round} />
            <path d="M76 140 L124 140 L126 152 C126 162 114 170 100 171 C86 170 74 162 74 152 Z" fill={cloth} {...edge} />
            <path d="M90 154 h20 v7 c0 2 -2 3 -4 3 h-12 c-2 0 -4 -1 -4 -3 Z" {...SHADE} />
          </>
        )}
        {a.prenda === "chaleco" && (
          <>
            <path d={LOWER} fill={cloth} {...edge} />
            <path d="M86 146.5 L100 162 L114 146.5 Z" fill={body} />
            <path d="M61 160 L139 160" stroke="#E9EAF2" strokeWidth={5} />
            <path d="M61 160 L139 160" stroke="#A9ADC4" strokeWidth={1.2} />
          </>
        )}

        {/* cara */}
        {showBrows && (
          <path d="M77 93 Q84 89 91 93 M109 93 Q116 89 123 93" fill="none" stroke={light ? hair : "#fff"} strokeOpacity={light ? 1 : 0.7} strokeWidth={a.base === "masculina" ? 4.5 : 3} {...round} />
        )}
        {eye(84)}
        {eye(116)}
        {a.base === "femenina" && mood !== "hablando" && (
          <path d="M76.5 101 L72.5 97 M123.5 101 L127.5 97" stroke={light ? INK : "#fff"} strokeWidth={2.2} {...round} />
        )}
        <circle cx={68} cy={124} r={8} fill={b.cheek} opacity={mood === "hablando" ? 0.75 : 0.55} />
        <circle cx={132} cy={124} r={8} fill={b.cheek} opacity={mood === "hablando" ? 0.75 : 0.55} />
        {mouth}

        {/* vello facial */}
        {a.vello === "barba" && (
          <>
            <path d="M80 122 C82 138 92 144 100 144 C108 144 118 138 120 122 C114 132 108 134 100 134 C92 134 86 132 80 122 Z" fill={hair} />
            <path d={MUSTACHE} fill={hair} />
          </>
        )}
        {a.vello === "bigote" && <path d={MUSTACHE} fill={hair} />}

        {/* cabello (arriba de la cima) */}
        {a.cabello === "mechon" && <path d="M100 52 C94 36 102 26 114 30 C106 34 104 42 108 52 Z" fill={hair} />}
        {a.cabello === "fleco" && (
          <path d="M58 70 C66 52 84 46 100 46 C116 46 134 52 142 70 C132 64 124 66 118 72 C112 64 104 64 100 70 C96 64 88 64 82 72 C76 66 68 64 58 70 Z" fill={hair} />
        )}
        {a.cabello === "coletas" && (
          <>
            <circle cx={52} cy={68} r={14} fill={hair} />
            <circle cx={148} cy={68} r={14} fill={hair} />
            <path d="M70 62 C80 52 120 52 130 62 C120 60 110 62 100 66 C90 62 80 60 70 62 Z" fill={hair} />
            <circle cx={61} cy={76} r={4} fill="#E86F5A" />
            <circle cx={139} cy={76} r={4} fill="#E86F5A" />
          </>
        )}
        {a.cabello === "chongo" && (
          <>
            <circle cx={100} cy={40} r={13} fill={hair} />
            <path d="M78 58 C86 48 114 48 122 58 C112 57 106 59 100 63 C94 59 88 57 78 58 Z" fill={hair} />
            <rect x={92} y={50} width={16} height={5} rx={2.5} fill="#E86F5A" />
          </>
        )}
        {a.cabello === "rizos" && (
          <g fill={hair}>
            <circle cx={80} cy={54} r={10} />
            <circle cx={94} cy={48} r={11} />
            <circle cx={108} cy={48} r={11} />
            <circle cx={121} cy={54} r={10} />
            <circle cx={70} cy={64} r={8} />
            <circle cx={131} cy={64} r={8} />
          </g>
        )}
        {a.cabello === "corto" && (
          <path d="M58 80 C58 58 78 47 100 47 C122 47 142 58 142 80 C136 71 128 66 120 68 C114 63 106 63 100 65 C94 63 86 63 80 68 C72 66 64 71 58 80 Z" fill={hair} />
        )}
        {a.cabello === "lateral" && (
          <>
            <path d="M58 82 C56 58 78 46 102 46 C126 46 144 60 142 82 C136 70 126 62 112 60 C100 62 84 66 72 74 C66 77 60 79 58 82 Z" fill={hair} />
            <path d="M80 56 C92 50 106 50 116 54" fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={3} {...round} />
          </>
        )}
        {a.cabello === "picos" && (
          <path
            d="M62 80 L63 63 L73 68 L77 50 L88 61 L99 43 L108 59 L120 48 L123 66 L136 59 L138 80 C128 71 114 66 100 66 C86 66 72 71 62 80 Z"
            fill={hair}
            stroke={hair}
            strokeWidth={3}
            strokeLinejoin="round"
          />
        )}
        {a.cabello === "rapado" && (
          <path d="M56 90 C58 64 78 52 100 52 C122 52 142 64 144 90 C134 76 118 70 100 70 C82 70 66 76 56 90 Z" fill={hair} fillOpacity={0.6} />
        )}
        {a.cabello === "cola" && (
          <>
            <path d="M136 56 C156 50 170 66 164 90 C160 98 154 100 150 96 C156 84 154 70 138 64 Z" fill={hair} />
            <path d="M60 76 C64 56 82 47 100 47 C118 47 136 56 140 74 C128 64 112 62 100 64 C88 62 72 66 60 76 Z" fill={hair} />
            <circle cx={139} cy={59} r={4.5} fill="#E86F5A" />
          </>
        )}
        {a.cabello === "trenzas" && (
          <>
            <path d="M58 80 C58 58 78 47 100 47 C122 47 142 58 142 80 C132 68 116 63 100 66 C84 63 68 68 58 80 Z" fill={hair} />
            <path d="M100 49 L100 64" stroke="#000" strokeOpacity={0.18} strokeWidth={2} {...round} />
            <g fill={hair}>
              <circle cx={55} cy={84} r={5.5} />
              <circle cx={51} cy={94} r={5.5} />
              <circle cx={49} cy={104} r={5.5} />
              <circle cx={49} cy={114} r={5.5} />
              <circle cx={145} cy={84} r={5.5} />
              <circle cx={149} cy={94} r={5.5} />
              <circle cx={151} cy={104} r={5.5} />
              <circle cx={151} cy={114} r={5.5} />
            </g>
            <circle cx={49} cy={121} r={3} fill="#E86F5A" />
            <circle cx={151} cy={121} r={3} fill="#E86F5A" />
          </>
        )}
        {a.cabello === "bob" && (
          <path
            d="M50 104 C44 66 70 46 100 46 C130 46 156 66 150 104 C146 96 142 84 134 76 C122 66 112 64 100 66 C88 64 78 66 66 76 C58 84 54 96 50 104 Z"
            fill={hair}
          />
        )}
        {a.cabello === "rizado" && (
          <g fill={hair}>
            <path d="M66 74 C70 57 84 50 100 50 C116 50 130 57 134 74 C122 66 110 64 100 65 C90 64 78 66 66 74 Z" />
            <circle cx={70} cy={70} r={7} />
            <circle cx={78} cy={60} r={7} />
            <circle cx={90} cy={53} r={7} />
            <circle cx={102} cy={51} r={7} />
            <circle cx={114} cy={54} r={7} />
            <circle cx={124} cy={61} r={7} />
            <circle cx={130} cy={70} r={7} />
          </g>
        )}
        {a.cabello === "mohicano" && (
          <>
            <path d="M56 90 C58 64 78 52 100 52 C122 52 142 64 144 90 C134 76 118 70 100 70 C82 70 66 76 56 90 Z" fill={hair} fillOpacity={0.3} />
            <path d="M90 68 L87 52 L94 55 L96 38 L102 51 L107 41 L110 56 L115 52 L111 70 Z" fill={hair} stroke={hair} strokeWidth={2} strokeLinejoin="round" />
          </>
        )}
        {a.cabello === "copete" && <path d="M80 56 C78 38 98 30 116 36 C124 40 122 48 114 50 C112 44 104 42 98 46 C94 50 92 54 90 58 Z" fill={hair} />}

        {/* lentes */}
        {a.lentes === "redondos" && (
          <g fill="none" stroke={frame} strokeWidth={2.5} {...round}>
            <circle cx={84} cy={108} r={12.5} />
            <circle cx={116} cy={108} r={12.5} />
            <path d="M96.5 107 Q100 104 103.5 107 M71.5 106 L60 103 M128.5 106 L140 103" />
          </g>
        )}
        {a.lentes === "cuadrados" && (
          <g fill="none" stroke={frame} strokeWidth={3} {...round}>
            <rect x={71} y={96} width={26} height={24} rx={5} />
            <rect x={103} y={96} width={26} height={24} rx={5} />
            <path d="M97 105 L103 105 M71 104 L60 101 M129 104 L140 101" />
          </g>
        )}
        {a.lentes === "gato" && (
          <g fill="none" stroke={frame} strokeWidth={3} {...round}>
            <path d="M69 99 Q84 93 97 99 Q97 121 84 121 Q70 119 69 99 Z" />
            <path d="M131 99 Q116 93 103 99 Q103 121 116 121 Q130 119 131 99 Z" />
            <path d="M97 103 L103 103 M69 99 L59 97 M131 99 L141 97" />
          </g>
        )}
        {a.lentes === "sol" && (
          <>
            <rect x={71} y={97} width={26} height={22} rx={8} fill={INK} stroke={frame} strokeWidth={2.5} />
            <rect x={103} y={97} width={26} height={22} rx={8} fill={INK} stroke={frame} strokeWidth={2.5} />
            <path d="M97 104 L103 104 M71 104 L60 101 M129 104 L140 101" stroke={frame} strokeWidth={2.5} {...round} />
            <path d="M77 103 L84 103 M109 103 L116 103" stroke="#fff" strokeOpacity={0.6} strokeWidth={2} {...round} />
          </>
        )}

        {/* accesorio de cabeza */}
        {a.accesorio === "gorra" && (
          <>
            <path d="M72 60 C72 36 128 36 128 60 Z" fill={acc} />
            <path d="M100 58 C118 54 140 56 144 62 C130 66 112 65 100 62 Z" fill={acc} />
            <path d="M100 58 C118 54 140 56 144 62 C130 66 112 65 100 62 Z" {...SHADE} />
            <circle cx={100} cy={42} r={3} {...SHADE} />
          </>
        )}
        {a.accesorio === "gorro" && (
          <>
            <circle cx={100} cy={32} r={8} fill="#fff" />
            <path d="M70 64 C70 30 130 30 130 64 Z" fill={acc} />
            <rect x={68} y={56} width={64} height={11} rx={5.5} fill={acc} />
            <rect x={68} y={56} width={64} height={11} rx={5.5} {...SHADE} />
          </>
        )}
        {a.accesorio === "audifonos" && (
          <>
            <path d="M44 104 C46 52 154 52 156 104" fill="none" stroke={INK} strokeWidth={6} {...round} />
            <rect x={34} y={94} width={16} height={24} rx={7} fill={acc} />
            <rect x={150} y={94} width={16} height={24} rx={7} fill={acc} />
          </>
        )}
        {a.accesorio === "mono" && (
          <>
            <path d="M128 56 L116 48 L117 64 Z M128 56 L140 48 L139 64 Z" fill={acc} />
            <circle cx={128} cy={56} r={4} fill={acc} />
            <circle cx={128} cy={56} r={4} {...SHADE} />
          </>
        )}
        {a.accesorio === "boina" && (
          <>
            <rect x={95} y={36} width={6} height={8} rx={3} fill={acc} />
            <ellipse cx={98} cy={52} rx={36} ry={11} transform="rotate(-8 98 52)" fill={acc} />
          </>
        )}
        {a.accesorio === "casco" && (
          <>
            <path d="M70 62 C70 36 130 36 130 62 Z" fill={acc} />
            <rect x={63} y={58} width={74} height={8} rx={4} fill={acc} />
            <rect x={63} y={58} width={74} height={8} rx={4} {...SHADE} />
            <path d="M100 40 L100 58" stroke="#000" strokeOpacity={0.18} strokeWidth={5} {...round} />
          </>
        )}
        {a.accesorio === "chef" && (
          <>
            <g fill="#fff" stroke={INK} strokeOpacity={0.15} strokeWidth={1.5}>
              <circle cx={82} cy={42} r={12} />
              <circle cx={118} cy={42} r={12} />
              <circle cx={100} cy={34} r={15} />
            </g>
            <rect x={74} y={50} width={52} height={13} rx={3} fill="#fff" stroke={INK} strokeOpacity={0.15} strokeWidth={1.5} />
          </>
        )}
      </g>
    </svg>
  );
}
