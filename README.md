# The Bleaches

A 2D browser fighting game in the spirit of *Bleach: Rebirth of Souls*, built around one idea: **a bankai should change how the opponent is able to fight, not just make numbers bigger.** Tensa Zangetsu makes the opponent's tracking lag behind. Konjiki Ashisogi Jizo's poison takes away their legs, then their arms. Enma Korogi takes away their senses.

Every character whose bankai appears in the manga is playable (22 in total).

## Play

Open `index.html` in a browser. There's no install and no build step. A keyboard is required.

- **VS CPU**: you against a CPU opponent. The CPU's decisions are visibly disrupted by bankai, and its current thinking appears under its health bar.
- **Local 2 players**: two players on one keyboard. Here bankai disrupt human inputs, footing and visibility.

| | Move | Jump | Guard | Light | Heavy | Special | Dash | Bankai |
|---|---|---|---|---|---|---|---|---|
| Player 1 | A / D | W | S | F | G | H | R | T |
| Player 2 | ← / → | ↑ | ↓ | , | . | / | ; | ' |

Esc pauses. Each fighter has two spirit orbs. Empty the health bar to shatter one, and shatter both to win. The reiatsu gauge fills as you fight. When it flashes **BANKAI READY**, release your bankai. It lasts until the gauge drains (about 20 seconds; some bankai are shorter). When you're trapped (Gokei, Itodome, the skeletons, the loom), mash attack buttons to break free.

## How bankai affect the opponent

Every input, from the keyboard or from the CPU, passes through the same status filter (`js/status.js`) before a fighter acts on it. A bankai can block actions, invert or delay inputs, take away traction or senses, and so on, and the rules are the same for humans and the CPU.

The CPU (`js/ai.js`) never reads bankai rules directly. It perceives the fight, sometimes wrongly (lagged tracking, chasing afterimages, blindness). It notices when its own actions fail, learns from what happens to it (guarding is useless against Kenpachi, hitting Shunsui hurts itself), and reacts to what it can see (telegraphed strikes, the lock-on reticle, poison clouds).

| Character | Bankai | What it does to the opponent |
|---|---|---|
| Ichigo Kurosaki | Tensa Zangetsu | Power compressed into speed. Flash steps leave afterimages, and the opponent tracks where he was: their turns, attacks and guard lag a beat behind him. |
| Byakuya Kuchiki | Senbonzakura Kageyoshi | A million blades. They shred incoming projectiles and drift as clouds that cut and slow anyone inside, herding the opponent into Gokei. |
| Toshiro Hitsugaya | Daiguren Hyorinmaru | The battlefield turns to ice. The opponent loses traction and slides, and every hit builds frost that slows their body until they freeze solid. |
| Mayuri Kurotsuchi | Konjiki Ashisogi Jizo | A giant golden Jizo crawls after the opponent breathing nerve poison. As it builds they lose jumping, then dashing, then their arms, then everything. |
| Renji Abarai | Soo Zabimaru | Higa Zekko: floating fangs pen the opponent into a narrow cage they cannot walk out of, then snap shut, and no guard covers that. They can only tear out with a dash, and the fangs bite. |
| Rukia Kuchiki | Hakka no Togame | She becomes absolute zero. Inside her white mist every movement builds frost, so the opponent must hold still or creep. Striking her body freezes the attacker. |
| Kenpachi Zaraki | Nameless Bankai | His body turns demonic and his swings cut through anything: blocking is useless and hits do not stagger him. The opponent has to stop guarding and start evading. (Its name was never revealed.) |
| Shunsui Kyoraku | Katen Kyokotsu: Karamatsu Shinju | A tragic play. Act one shares wounds: whatever he suffers, the opponent suffers too, so hitting him is self-harm. The final act, Itodome, strangles with thread. |
| Genryusai Yamamoto | Zanka no Tachi | Every flame folds into the blade. The air around him scorches and touching him burns the attacker. Keep your distance and the burnt dead of Kaka Jumanokushi rise to hold you. |
| Soi Fon | Jakuho Raikoben | A missile launcher bolted to her arm. A lock-on reticle stalks the opponent, and the longer they stay inside it the bigger the blast, so they can never stop moving. |
| Sajin Komamura | Kokujo Tengen Myo-o | A colossal armoured giant mirrors his swings across the whole arena. Its shadow marks where the blade will land, and the opponent has to read it and get out from under it. |
| Retsu Unohana | Minazuki | Her cuts bleed, and they bleed faster the harder the victim exerts themselves. The opponent has to stop running and dashing, while she heals from every wound she opens. |
| Gin Ichimaru | Kamishini no Yari | A blade that crosses the whole arena in an instant, so keeping distance is pointless. A hit leaves a sliver inside that he can dissolve at will. The opponent must rush him and keep him busy. |
| Kaname Tosen | Suzumushi Tsuishiki: Enma Korogi | A dome that strips away sight, hearing, smell and spiritual sense. Inside it the opponent can't see him or turn to face him, and has to guess from the sound of his blade. |
| Shinji Hirako | Sakashima Yokoshima Happofusagari | An inverted world. Left and right swap for the opponent, and so do up and down (jump and guard). Just as they adapt, Shinji flips it back. The harder they think, the deeper they fall. |
| Rojuro Otoribashi | Kinshara Butodan | A stage of music-driven illusions. Golden phantoms fly at the opponent alongside the real attacks and look identical, so they waste guards and jumps on attacks that aren't there. Only the real ones cast a shadow. |
| Kensei Muguruma | Tekken Tachikaze | Brass knuckles that hit with shockwaves. Every blow concusses: the opponent's inputs arrive late, so their timing, blocks and escapes all lag a beat behind. |
| Ikkaku Madarame | Ryumon Hozukimaru | Three giant blades and a dragon crest that fills red with every clash, hits given and taken alike, until his strength doubles. Trading blows feeds him, so the opponent has to disengage and wait it out. |
| Chojiro Sasakibe | Koko Gonryo Rikyu | He commands the lightning of the whole sky. Anyone who leaves the ground is struck, so the opponent loses jumping entirely, and bolts keep raining on marked ground across the arena. |
| Kisuke Urahara | Kannonbiraki Benihime Aratame | Restructures whatever it touches. A hit tears down an active bankai, or else seals one of the opponent's tools: light or heavy attacks, special, dash or jump. He can restructure his own wounds too. |
| Ichibe Hyosube | Shirafude Ichimonji | Ink that blots out names and a brush that writes new ones. Each stroke erases one of the opponent's abilities for the rest of the bankai (special, then dash, then jump), then renames them into something weak. |
| Senjumaru Shutara | Shatatsu Karagara Shigarami no Tsuji | A great loom weaves threads through the arena. Brushing one snares the opponent, so they have to pick their way through the gaps, and she can re-weave the lattice tight around them. |

Only bankai shown in the manga are included. Bankai that appear only in the novels or in anime filler are not.

## Code layout

| File | Purpose |
|---|---|
| `js/core.js` | Constants and helpers |
| `js/status.js` | Status effects and the intent filter |
| `js/fighter.js` | Movement, attacks, frame data |
| `js/characters.js` | The roster and each bankai's rules |
| `js/world.js` | Match simulation: hits, projectiles, zones, telegraphed strikes, summons |
| `js/ai.js` | CPU opponent |
| `js/render.js` | Procedural canvas art and HUD |
| `js/main.js` | Menus, keyboard input, main loop |

Everything except `render.js` and `main.js` is pure logic that runs headless.

## Tests

```sh
node --test tests/sim.test.js                          # one test per bankai effect, CPU adaptation, full CPU-vs-CPU matches
NODE_PATH=$(npm root -g) node tests/smoke.js shots/    # headless Chromium: menus, a fight, every bankai; saves screenshots
```

The smoke test needs Playwright with Chromium available.
