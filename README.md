# FIELD OF HONOR

A modern military first-person shooter that runs in the browser. It is built with three.js and plain JavaScript, with no build step and no asset files. Every model, texture, sound and piece of music is generated in code.

> Task Force ORION hunts MERIDIAN, a private army that has stolen **HALCYON**, the ground key to an orbital kinetic-strike constellation.

## Play

```bash
npm start
```

Then open <http://localhost:8080>. You need Node 18 or newer. There are no dependencies to install, and three.js is vendored in `src/lib/`.

The game has to be served over HTTP because ES modules don't load from `file://`. Any static server works, including GitHub Pages.

Use a desktop browser (Chrome, Edge or Firefox) with a keyboard and mouse. Headphones help, because sound is positional.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look / aim |
| Left click | Fire |
| Right click | Aim down sights |
| R | Reload |
| Shift | Sprint. While scoped with a sniper, hold breath |
| Space | Jump, vault over or climb onto low cover, or stand up |
| C | Crouch. While sprinting, slide |
| Ctrl / Z | Prone |
| E | Interact, pick up, swap weapon |
| 1 / 2 / mouse wheel / X | Switch weapon |
| G | Lethal equipment (hold to cook a frag; press again to detonate C4) |
| Q | Tactical equipment |
| V | Melee |
| B | Toggle fire mode |
| F | Flashlight. With night vision down it becomes an IR illuminator that enemies can't see |
| N | Night vision goggles (flip down / up) |
| Tab | Scoreboard |
| Esc | Pause |

Browsers reserve Ctrl+W, so it can close the tab. The game goes fullscreen with keyboard lock when you deploy, which stops this in Chrome and Edge. You can turn this off in Settings. **Z** also works as a prone key.

## What's in this version

**Core gameplay**
- First-person movement: walk, sprint, slide, jump, crouch and prone. Stance changes check for headroom, you can climb stairs, and you can use multi-storey buildings with roof access.
- Weapon handling: hip-fire spread and bloom, aim down sights with optic zoom, per-weapon recoil patterns with recovery, and camera kick.
- Weapon animation: sway and bob, reloads where the magazine drops out and a new one goes in, empty reloads that pull the charging handle, per-shell shotgun reloads you can interrupt, bolt and pump cycling, a pistol slide that locks back, sprint pose, raise and lower on weapon switch, and a melee bash.
- Health regenerates CoD-style. There are hit direction indicators, a low-health vignette and heartbeat, suppression when bullets whiz past, a flashbang blind effect and tinnitus.
- Scopes: sniper (with a mil-dot reticle and hold breath), 3× ACOG and thermal (enemies glow white). Red dot and holographic sights are modelled on the gun.

**Arsenal** (12 weapons, all fictional)
- Assault rifles: VX-4 Talon, RK-74 Volkov
- Marksman rifle: HX-30 Bastion
- SMGs: MP-9 Wasp, K-45 Viper
- Sniper rifles: LR-50 Longbow (bolt-action), SR-7 Specter
- Shotguns: Breaker-12 (pump), AA-20 Havoc (auto)
- LMG: M-260 Juggernaut
- Pistols: P-11 Warden, .50 Raptor

Every weapon has its own synthesized firing sound, damage and range falloff, fire rate, recoil pattern, fire modes and procedurally built model.

The Gunsmith has six attachment slots: optic, muzzle, barrel, underbarrel, magazine and stock. There are 19 attachments, including a suppressor, compensator, extended and fast mags, grips, a laser, and reflex, holo, 3×, 8× and thermal optics. Each one changes stats and shows up on the model.

Equipment: frag (cookable), sticky semtex, remote C4, flashbang, smoke (blocks AI line of sight) and a combat stim. Explosions are big: a blinding fireball, a shockwave ring and a dust wave racing along the ground, dirt and fragments thrown high, and a smoke column that keeps pouring. There's heavy camera shake and muffled hearing up close. Flashbangs white you out, then leave a burned-in afterimage of what you were looking at, with ringing ears. They're worse through night vision.

**Enemy AI**
- Enemies patrol routes and stand guard.
- Detection builds up gradually. It depends on distance, your stance, your movement, fog, darkness and your flashlight, so stealth is possible. In the campaign a stealth meter under the compass shows when you're being noticed, and missions start in cover with a few seconds' grace.
- They hear unsuppressed gunfire and explosions, and investigate noises.
- In a fight they take cover using auto-generated cover points and alternate between hiding and peeking. Behind tall cover they step out to shoot.
- They reposition, flank and push your last known position. They walk while firing and sprint between cover without shooting.
- Realistic marksmanship. Their aim settles onto you over about a second, then they hit reliably. They aim centre mass, or at your head if that's all that shows above cover. Moving targets are much harder to hit, especially sprinting side to side. So are distance, darkness and fog. Being suppressed, hit or on the move throws off their aim.
- Trigger discipline: long bursts up close, short bursts at mid range, aimed single shots far out. Muzzle climb pushes later rounds in a burst high. LMGs lay down long strings of fire. Snipers wait for a settled shot, and their scope glints when they're aiming at you.
- Visible weapon handling. They shoulder the rifle with a bladed stance and cheek weld, and take a knee to shoot or reload. The gun kicks with recoil and ejects brass. Bolt-action and pump guns are cycled by hand. Reloads show the magazine coming out (empties fall to the ground), a fresh one drawn from the vest and the charging handle racked. They top up their magazines in cover and call out when reloading.
- Hits make them flinch toward the side the shot came from. They die in one of three ways: crumpling on the spot from a headshot, toppling away from the shot, or twisting to the ground.
- They throw grenades at you when you hide, and scatter from grenades thrown at them.
- Squads share intel and limit how many members move at once.
- Snipers and guards hold position in towers and on roofs. Bosses are heavily armoured and keep pushing forward.
- There are four difficulty levels: Recruit, Regular, Hardened and Veteran.
- In the campaign, friendly squadmates follow you in formation and fight alongside you.

**Game modes**
- **Campaign:** 8 missions with briefings, helicopter fast-rope insertions (press E to rope down) or intro cinematics, location and time cards, radio dialogue with subtitles, objective markers and a compass, checkpoints, stealth alarms, defend waves, boss fights and a final mission against a countdown.
- **Team Deathmatch:** up to 16 players (you plus bots) in two teams.
- **Free For All:** every player for themselves.
- **Domination:** capture flags A, B and C. Capture progress can be contested, and points tick while you hold flags.
- **Survival:** endless waves that escalate. Heavies arrive every 5th wave and a warlord boss every 10th.

**Maps** (each has multiple routes, interiors, rooftops and cover lines)
1. **Desert Outpost:** hesco compound, two-storey HQ, watchtowers and village ruins
2. **Downtown:** gutted city blocks, a plaza, burnt-out vehicles and rooftop lanes
3. **Snowfall:** mountain radar station, hangar, bunkers, fuel tanks and treelines
4. **Blacksite:** underground facility with a server room, lab, armory, control room, cells and an atrium
5. **Harbor:** container terminal, warehouses, gantry cranes and a moored cargo ship

**Visuals**
- Lighting presets for day, desert, dusk, dawn, overcast, night (moonlight and stars), snow and indoor.
- Weather: rain with lightning, snow, dust and ash.
- Fog, soft shadows, ACES tone mapping and a sky-based environment map.
- Particle explosions, smoke columns, smoke grenades, muzzle flashes, tracers, sparks, impact dust, bullet-hole and scorch decals, and ejected brass.
- Night-vision goggles modelled on a Gen 3 image intensifier. Automatic brightness control opens up in the dark and clamps down when a flash or explosion floods the tube. Bright sources get proper halos. The image is crisp, with photon-limited scintillation noise and a faint microchannel honeycomb, seen through a dual-tube view that flips down. Green or white phosphor; optionally on automatically for night missions (Settings).
- Through the goggles you and your squad carry IR aiming lasers that show as beams, and the flashlight becomes an invisible IR flood.
- Weapons are built from real side profiles with bevelled edges: picatinny rails, slotted handguards, flash hiders, ejection ports, charging handles, open-tube red dots, holographic sights and turreted scopes, with anodised-metal, stippled-polymer and wood-grain finishes.
- Maps are dressed with building facades (window frames, glass, door frames, rooftop units), vegetation, road markings, street furniture, power lines, wire, debris, puddles, tyre tracks and distant backdrops.

**Sound**
- Realistic gunfire made only from shaped noise, with no musical tones: an instant crack, a loud bang, a low pressure thump and a short rumble. Close to the gun you also hear the action clack. Gunfire runs through its own channel with soft saturation and fast compression, like a close-range field recording.
- Sound travels at the speed of sound. Distant shots and explosions arrive after the flash, sounding duller and mostly echo. Supersonic rounds fired at you crack past before you hear the report, and close passes rip the air. Bullets ricochet off metal and concrete.
- Every map has its own echo, generated for that environment. City streets slap back fast and flutter between buildings. The snowy mountains send back long rolling echoes. Open desert is dry, with late returns off the ridges. Harbor containers ring bright and metallic. Indoor concrete is dense, short and boomy.
- A final limiter keeps stacked gunfire and explosions from distorting.

**Interface**
- An animated main menu over a live 3D map.
- Campaign select, mission briefing, multiplayer setup, the Armory (loadout) and the Gunsmith with a 3D weapon preview.
- Settings for sensitivity, FOV, audio, graphics quality and render scale.
- Statistics with a rank and XP system.
- Pause menu, mission-failed screen with checkpoint retry, mission results and match scoreboards.
- Progress, stats and loadouts are saved to `localStorage`.

## Project layout

```
index.html, styles/main.css   UI shell and styling
src/main.js                   entry point
src/ui/App.js                 renderer, main loop, all menu screens and game flow
src/ui/HUD.js                 in-game HUD (DOM overlay)
src/ui/MenuScene.js           3D menu backdrop and weapon showcase
src/Game.js                   a running match/mission: combat resolution, pickups, rendering
src/player/Player.js          first-person controller
src/weapons/                  weapon data, attachments, viewmodels, firing system, grenades
src/ai/                       soldier AI and the animated humanoid model
src/modes/                    campaign runner, TDM/FFA/Domination/Survival
src/campaign/Story.js         the 8-mission script, characters and dialogue
src/world/                    collision world + navigation/cover, map builder, maps, lighting/weather, effects, textures
src/core/                     input, procedural audio engine, storage, utilities
```

## What a full engine (e.g. Unreal Engine 5) would add

The browser version plays the whole loop described above. Some things are beyond a no-asset WebGL build:

- **Real online multiplayer.** Multiplayer modes here use AI bots locally. Online play needs dedicated servers, netcode, lag compensation and matchmaking.
- **Photoreal assets.** Scanned environments, high-poly weapon models, motion-captured animation, ragdoll physics and recorded audio and voice acting. The models here are procedural primitives, and dialogue is subtitled radio text.
- **Advanced rendering.** Global illumination (Lumen), virtualized geometry (Nanite), volumetric clouds and fog, screen-space reflections, and post-processing such as motion blur and depth of field.
- **Destruction and full physics.** Breakable walls, vehicles you can drive, bullet penetration through materials.
- **Pre-rendered cutscenes** with facial animation. The campaign uses in-engine camera fly-throughs instead.
