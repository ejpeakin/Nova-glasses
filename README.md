# FIELD OF HONOR: US ARMY SPECIAL FORCES

A modern military first-person shooter that runs in the browser. It is built with three.js and plain JavaScript, with no build step. Almost everything is generated in code: models, textures, sounds and music. The exceptions:

- **First-person hands**: the rigged WebXR "generic hand" meshes that three.js uses for hand tracking (MIT, embedded as data in `src/assets/hands.js`), posed into weapon grips in code and dressed as tactical gloves.
- **Soldiers**: the rigged, textured SWAT operator character by Mixamo (helmet with goggles, plate carrier, pouches, knee pads; `src/assets/soldier.js`, see `src/assets/SOLDIER_CREDIT.md`). Every army soldier wears it, repainted per faction (OCP-style camouflage with coyote kit for ORION, black with balaclavas for MERIDIAN, sand and white camouflage for the desert and snow forces). The game's own procedural animation (gait, crouch, kneel, aiming, reloads, deaths) drives its skeleton, and the arms are solved with IK so the gloves stay on the weapon. Civilians and the heavy juggernauts keep the procedural body.
- **Soldier moves**: motion-captured clips supplied for the game, trimmed from the uploaded animation sets to the ones that fit a military shooter (`src/assets/moves.js`): four deaths (buckling forward onto the face, thrown back off the feet by a heavy hit, going over backwards, sagging to the knees), flinches when hit in the chest or head, a crouch walk, jab, cross and a front kick for fighting at arm's reach, an overhand grenade throw (the grenade leaves the hand on the throw), an interact and a radio check that bored guards play while idle, a nod when a squadmate takes your order, and talking and a salute in the briefing film. Dances, sword, spell, zombie, farming and similar clips were left out. Each clip frame is converted at load into the procedural rig's own terms (pelvis, chest and head rotation, leg directions, hand positions relative to the shoulders), so every soldier can wear them at his own proportions.
- **Assault rifle and SMG fire**: recorded reports (`src/assets/gunfire.js`), single shots cut from two full-auto recordings, played shot by shot with the burst's echo after the last one. The other guns are synthesized.

*A work of fiction. Field of Honor: US Army Special Forces is not affiliated with, or endorsed by, the U.S. Army or the U.S. Department of Defense. All characters, units, weapons and places are fictional.*

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
| Right click or Left Alt | Aim down sights / scope (hold). Left click still fires while aiming |
| R | Reload |
| Shift | Sprint. While scoped with a sniper, hold breath |
| Space | Jump, vault, or climb ledges, walls, fences and containers up to 2.7 m. In mid-air, grab a ledge. Also stands you up |
| T | Rappel rope (campaign). At a roof or rock edge with a drop below, clip in and go over facing the wall, then bound down it. Hold Shift for bigger bounds |
| C | Crouch. While sprinting, slide |
| Ctrl / Z | Prone |
| E | Interact, pick up, swap weapon |
| 1 / 2 / mouse wheel / X | Switch weapon |
| G | Lethal equipment (hold to cook a frag; press again to detonate C4) |
| Q | Tactical equipment |
| V | Melee. From behind, or on an unaware enemy, a silent takedown |
| B | Toggle fire mode |
| L | Weapon laser on SMGs and rifles: a beam from the muzzle and a dot where your shots land. Hip fire is much tighter while it's on. The weapon panel shows [L] LASER ON/OFF, and the Gunsmith's Laser module row sets whether it starts on |
| Y, then 1-6 | Squad radio. 1 On me, 2 Hold position, 3 Move up (to where you aim), 4 Cover me (suppressing fire where you aim), 5 Enemy spotted (marks the target and the squad engages it), 6 Hold fire / Weapons free. Squadmates answer over the radio (spoken replies can be turned off in Settings) |
| H | Squad: "On me!" |
| K (hold) | Talk to your squad on the microphone: say "on me", "hold position", "move up", "cover me", "contact", "hold fire" or "weapons free". Uses the browser's speech recognition (Chrome and Edge; they send the audio to their speech service) |
| Mouse wheel (scoped) | Zoom variable scopes: sniper 6×, 10× or 14×; thermal 3×, 5× or 8× |
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

Every weapon has its own firing sound (recorded for the assault rifles and SMGs, synthesized for the rest), damage and range falloff, fire rate, recoil pattern, fire modes and procedurally built model.

The Gunsmith has six attachment slots: optic, muzzle, barrel, underbarrel, magazine and stock. There are 19 attachments, including a suppressor, compensator, extended and fast mags, grips, a laser, and reflex, holo, 4× prism, 6-14× variable sniper and 3-8× thermal optics. Each one changes stats and shows up on the model.

Equipment: frag (cookable), sticky semtex, remote C4, flashbang, smoke (blocks AI line of sight) and a combat stim. Explosions are big: a blinding fireball, a shockwave ring and a dust wave racing along the ground, dirt and fragments thrown high, and a smoke column that keeps pouring. There's heavy camera shake and muffled hearing up close. Flashbangs white you out, then leave a burned-in afterimage of what you were looking at, with ringing ears. They're worse through night vision.

**Enemy AI**
- Enemies patrol routes and stand guard.
- Detection builds up gradually. It depends on distance, your stance, your movement, fog, darkness and your flashlight, so stealth is possible. In the campaign a stealth meter under the compass shows when you're being noticed, and missions start in cover with a few seconds' grace.
- They hear unsuppressed gunfire and explosions, and investigate noises.
- In a fight they take cover using auto-generated cover points and alternate between hiding and peeking. Behind tall cover they step out to shoot.
- They move like a trained team, not a crowd. In contact or when searching they crouch-walk at a measured pace with the rifle shouldered, facing the threat. Their hips turn with the direction of travel, so they can walk sideways or backwards while aiming. They only rush when they have to cross ground under fire to reach far cover. Soldiers keep a couple of metres of personal space (only stacked on a door do they stand shoulder to shoulder). A squad picks cover near the rest of the squad but not behind the same bit of wall, advances side by side about 3 m apart and sends at most one flanker. A search team moves in a well-spaced staggered file behind a point man who waits for stragglers, each man covering his own side and the last man watching the rear. Your own squad follows in a well-spaced staggered file 3–14 m behind you, anchored to your direction of travel (looking around doesn't send them running). Every move is measured: they step off one at a time a beat after you do, walk at a slow tactical pace with rifles shouldered into their own sectors (jogging only to close a big gap), don't shuffle for small shifts, take a knee when you halt and nod when you give them an order. In the campaign you walk at a deliberate tactical pace too (sprint is still there), and on stealth missions the team lead tells you to slow down if you rush ahead.
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
- **Campaign:** 13 missions in the style of a spy thriller. You're a covert operative: you climb onto rooftops by stairs and ledges, rappel down walls on a rope, take guards down silently, and tag targets by holding your sights on them. Guards who find a body raise the alarm unless you silence them. Every mission has cinematic cutscene clips between objectives. *Black Water* is a solo night infiltration of the harbor: climb the fire stairs onto a warehouse, snipe from the roof with a cached suppressed rifle, rappel down the wall, take the office and steal the manifest. *White Silence* starts on a sniper perch on a rock outcrop: rappel down, slip through the wire and splice the uplink from the radar roof. The other missions mix assaults, rescues and boss fights. *Hard Breach* is the loud kind of SWAT raid: stack on the front door of MERIDIAN's three-storey shipping office, blow it with a breaching charge (everyone behind it is stunned and a 75-second clock starts on the hostages), flash and clear the ground floor with your squad, cuff the cell leader, take the top floor alone and free the hostages, copy the files and hold the building until they're sent. *Quiet Hours*, the final mission, is a SWAT-style night raid on a downtown safehouse. You ride in, lights off, in the back of an unmarked van that pulls in to the kerb a block north; the side door slides open, the squad steps down and spreads out along the wall, and you follow them out. You and a squad carrying suppressed weapons move quietly: on this raid the enemy can't hear your team's shots at all, and a single headshot drops any of them (they can still see you, and a guard who finds a body raises the alarm unless you silence him). The squad stacks up on doors and waits for you. You pick the lock, clear the hall, the bedroom and the office room by room, free the hostages and cuff Dr. Hart. If the street wakes up, a 60-second countdown starts on the hostages. All missions have briefings, helicopter fast-rope insertions (press E to rope down) or intro cinematics, location and time cards, radio dialogue with subtitles, objective markers and a compass, checkpoints, stealth alarms, defend waves, boss fights and a final mission against a countdown.
- **Story:** HALCYON is a ring of US satellites that can drop steel rods from orbit onto any target on Earth. Firing it takes three things: the HALCYON key (a suitcase-sized control unit), the launch codes (known only to the engineer who built it, Dr. Lena Hart) and a dish that can reach the satellites. The private army MERIDIAN, run by Anton Vasko, ambushes the convoy carrying the key and takes Hart with it. Task Force ORION:
  1. tags the key at a harbor
  2. rescues Hart from a desert outpost
  3. breaks up the sale in Vel Harat
  4. arrests the buyer, Oskar Brandt, at a midnight meeting (*Night Market*)
  5. takes MERIDIAN's satellite dish in the mountains
  6. raids their secret lab, Facility 6, where the server logs show that Hart staged her own kidnapping
  7. chasing Hart, is shot down
  8. destroys the missile launcher that did it and steals her convoy's route (*Sandstorm*)
  9. breaches MERIDIAN's shipping office in Port Kaval, frees their hostages and takes the files that name the ship (*Hard Breach*)
  10. takes the key at the docks, but it's a decoy
  11. cuts the mountain power to the launch vault (*Blackout*)
  12. stops the launch and arrests Vasko
  13. captures Hart in a quiet night raid

  Every mission's menu card and briefing show *the story so far* and *your job*, each mission opens with a one-line "YOUR JOB" message, and the results screen tells you what comes next.
- **Story film:** every new campaign (starting Mission 1) opens with a 100-second in-engine film. It's also on every mission card as WATCH THE STORY. Everything in it is generated in code:
  1. a procedurally textured Earth (day and night sides, city lights, clouds, ocean glint and an atmosphere) with the HALCYON satellite ring passing in front
  2. a satellite opening its magazine and dropping a rod that burns through re-entry
  3. the strike on a desert test range: flash, fireball, shockwave and mushroom cloud
  4. the HALCYON key open in a secure lab
  5. the night convoy
  6. the ambush (roadside bomb, muzzle flashes and tracers on the hill, fighters filing down, Hart taken)
  7. Vasko at his office window with his strike targets and buyers' bids on the screens
  8. Task Force ORION introduced one by one at dawn before boarding the helicopter
  9. the title over the constellation

  Narration runs as subtitles and is spoken when Squad voices is on. Hold Space or click SKIP to skip it.
- **Armory and ranks:** at the start of each campaign mission you pick your primary and sidearm from the weapon rack. On helicopter insertions the rack is in the cabin, and the flight waits until you lock in. On other missions you gear up at the start point. Use A and D (or the mouse wheel) for the primary, W and S for the sidearm, and E to lock and load. Better weapons need a higher rank: the K-45 at Private First Class, the RK-74 and .50 Raptor at Corporal, the HX-30 at Sergeant, the AA-20 at Staff Sergeant, the SR-7 at Sergeant First Class, the M-260 at Master Sergeant and the LR-50 at Second Lieutenant. The mission's issued kit is always on the rack, whatever your rank. Kills and completed missions earn XP (more on harder difficulties).
- **Hands-on objectives:** objectives are real objects that you physically work on. Hold E and you step up to the object, get down to its height and look at it. Your weapon drops out of view and your hands do the job: typing on a rugged laptop patched into a server (the screen shows live progress), pressing a tracker or C4 charge onto the surface and arming it, cutting a hostage's zip ties with a knife, cuffing a prisoner with a zip tie, splicing wires with cutters (with sparks), picking a door lock, pulling a drive or the HALCYON core out, or hauling a wounded man out of a wreck. Work you've done stays done if you step away.
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
- Night-vision goggles modelled on a modern image intensifier. Press N and your support hand comes off the rifle, reaches up to the helmet mount and swings the dual tubes down over your eyes; the picture opens out from the centre once they're in place (flipping them up works the same way in reverse). Automatic brightness control opens up in the dark and clamps down when a flash or explosion floods the tube. Bright sources get soft halos. The picture is a clean, full-screen teal phosphor image with deep shadows, faint grain in the dark and corners that fall off to black (white phosphor is an option). They can come on automatically for night missions (Settings).
- Through the goggles you and your squad carry IR aiming lasers that show as beams, and the flashlight becomes an invisible IR flood.
- Weapons are built from real side profiles with bevelled edges: picatinny rails with numbered slots, slotted handguards, flash hiders, ejection ports, charging handles, open-tube red dots, holographic sights and turreted scopes. Fine detail includes roll marks and selector stamps, pins, screws, QD sling sockets, mag witness windows with the rounds showing and pull tabs, the AK's dust-cover rib, rivets, cleaning rod and bayonet lug, a shotgun side-saddle and pistol slide marks and levers. Soldiers' rifles carry slings in coyote, olive or black. Each gun has its own finish: the VX-4 is black with flat dark earth (FDE) stock, grip, mag and suppressor, a gold match trigger and a fibre-optic front post. The RK-74 has wood furniture and a plum bakelite mag, the Wasp and Havoc have olive drab polymer, the Viper is tungsten grey with FDE, and the P-11 has an FDE frame under a black slide. The two precision rifles are rattle-can camouflaged (arid and woodland, sprayed through netting and leaves, worn back to black on the edges) with cloth tape wraps, and the M-260 has FDE furniture, a coyote ammo pouch and taped handle. Finishes are anodised metal, parkerised steel, mottled moulded polymer and wood grain, all with service wear (handling scratches, rubbed patches and grime). A hot barrel smokes after a burst.
- Blood: hits throw a spray, mist and falling droplets, spatter the wall or floor behind the target and drip on the ground, and a pool spreads under each body once it comes to rest.
- Maps are dressed with building facades (window frames, glass, door frames, rooftop units), vegetation, road markings, street furniture, power lines, wire, debris, puddles, tyre tracks and distant backdrops. A second detail layer fills each battlefield: grass and weed tufts, pebbles, litter, cans, spent brass, shell craters, sandbagged firing positions, burnt-out wrecks, ruined walls, rubble with rebar, supply piles, barrels and mooring ropes, and in the blacksite desks, shelving, filing cabinets, carts, pallets, overturned desks, cables and barricades.

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
src/campaign/Story.js         the 12-mission script, characters and dialogue
src/world/                    collision world + navigation/cover, map builder, maps, lighting/weather, effects, textures
src/core/                     input, audio engine, storage, utilities
```

## What a full engine (e.g. Unreal Engine 5) would add

The browser version plays the whole loop described above. Some things are beyond a no-asset WebGL build:

- **Real online multiplayer.** Multiplayer modes here use AI bots locally. Online play needs dedicated servers, netcode, lag compensation and matchmaking.
- **Photoreal assets.** Scanned environments, high-poly weapon models, motion-captured animation, ragdoll physics and recorded audio and voice acting. The models here are procedural primitives, and dialogue is subtitled radio text.
- **Advanced rendering.** Global illumination (Lumen), virtualized geometry (Nanite), volumetric clouds and fog, screen-space reflections, and post-processing such as motion blur and depth of field.
- **Destruction and full physics.** Breakable walls, vehicles you can drive, bullet penetration through materials.
- **Pre-rendered cutscenes** with facial animation. The campaign uses in-engine camera fly-throughs instead.
