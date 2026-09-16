/** Documentation table of contents (small, loaded eagerly for search). Content is lazy (content.ts). */
export interface DocPage {
  id: string;
  title: string;
  group: 'Basics' | 'Building scenes' | 'Assets' | 'Play & performance' | 'Shipping' | 'About';
  keywords: string;
}

export const DOC_PAGES: DocPage[] = [
  { id: 'getting-started', title: 'Getting Started', group: 'Basics', keywords: 'first project quick start tutorial' },
  { id: 'creating-a-project', title: 'Creating a Project', group: 'Basics', keywords: 'wizard template profile platform' },
  { id: 'editor-basics', title: 'Editor Basics', group: 'Basics', keywords: 'viewport camera hierarchy inspector gizmo touch gestures' },
  { id: 'keyboard-shortcuts', title: 'Keyboard Shortcuts', group: 'Basics', keywords: 'keys hotkeys ctrl' },
  { id: 'scenes-and-objects', title: 'Scenes & Objects', group: 'Building scenes', keywords: 'primitives cube parent hierarchy transform' },
  { id: 'materials', title: 'Materials', group: 'Building scenes', keywords: 'colour texture metal rough emissive' },
  { id: 'lighting', title: 'Lighting', group: 'Building scenes', keywords: 'sun point spot sky shadows fog' },
  { id: 'camera', title: 'Cameras', group: 'Building scenes', keywords: 'main camera follow orthographic 2d' },
  { id: 'behaviours', title: 'Behaviours (Scripting)', group: 'Building scenes', keywords: 'player controller rotate bob collectible script logic' },
  { id: 'physics', title: 'Physics & Colliders', group: 'Building scenes', keywords: 'rigid body gravity collider trigger jump' },
  { id: 'animation', title: 'Animation', group: 'Building scenes', keywords: 'animation skeletal clips' },
  { id: 'importing-models', title: 'Importing Models', group: 'Assets', keywords: 'glb gltf obj fbx textures audio optimize import' },
  { id: 'using-assets', title: 'Using the Asset Library', group: 'Assets', keywords: 'official free open licence download attribution' },
  { id: 'play-mode', title: 'Play Mode', group: 'Play & performance', keywords: 'run test game hud' },
  { id: 'optimization', title: 'Performance & Battery', group: 'Play & performance', keywords: 'fps quality battery thermal low-end optimization' },
  { id: 'moving-projects', title: 'Moving Projects Between Devices', group: 'Shipping', keywords: 'export import mfpack phone pc backup' },
  { id: 'building', title: 'Building & Exporting', group: 'Shipping', keywords: 'build export web android windows apk exe' },
  { id: 'publishing', title: 'Publishing', group: 'Shipping', keywords: 'play store release checklist' },
  { id: 'privacy', title: 'Privacy & Your Data', group: 'About', keywords: 'data analytics telemetry storage account' },
  { id: 'troubleshooting', title: 'Troubleshooting', group: 'About', keywords: 'error crash recovery webgl storage' },
  { id: 'privacy-policy', title: 'Privacy Policy (draft)', group: 'About', keywords: 'legal policy' },
  { id: 'terms-of-use', title: 'Terms of Use (draft)', group: 'About', keywords: 'legal terms copyright' },
];
