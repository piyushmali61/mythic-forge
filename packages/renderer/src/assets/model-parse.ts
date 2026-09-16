import { UserFacingError, type FileFormat } from '@mythic-forge/core';
import { parseGltf, sandboxedManager, toArrayBuffer, type InputFile, type ParsedModel } from './glb.ts';

export type { InputFile, ParsedModel } from './glb.ts';

/**
 * Parses GLB/glTF/OBJ/FBX from in-memory files for the import workflow.
 * OBJ and FBX loaders are loaded on demand so they never weigh down the editor or exported games.
 * `warnings` receives non-fatal problems.
 */
export async function parseModel(main: InputFile, format: FileFormat, companions: readonly InputFile[], warnings: string[]): Promise<ParsedModel> {
  const blocked: string[] = [];
  const sandbox = sandboxedManager(companions, blocked);
  try {
    let result: ParsedModel;
    if (format === 'glb' || format === 'gltf') {
      result = await parseGltf(main, format === 'glb', companions, sandbox);
    } else if (format === 'obj') {
      const [{ OBJLoader }, { MTLLoader }] = await Promise.all([
        import('three/addons/loaders/OBJLoader.js'),
        import('three/addons/loaders/MTLLoader.js'),
      ]);
      const loader = new OBJLoader(sandbox.manager);
      const text = new TextDecoder().decode(main.bytes);
      const mtlName = /^mtllib\s+(.+)$/m.exec(text)?.[1]?.trim();
      const mtlBase = mtlName?.split(/[\\/]/).pop()?.toLowerCase();
      const mtl = mtlBase ? companions.find((f) => f.name.toLowerCase() === mtlBase) : undefined;
      if (mtl) {
        const materials = new MTLLoader(sandbox.manager).parse(new TextDecoder().decode(mtl.bytes), '');
        materials.preload();
        loader.setMaterials(materials);
      } else if (mtlName) {
        warnings.push(`Material file "${mtlName}" was not selected; default materials are used.`);
      }
      result = { root: loader.parse(text), animations: [] };
    } else if (format === 'fbx') {
      const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
      const loader = new FBXLoader(sandbox.manager);
      const group = loader.parse(toArrayBuffer(main.bytes), '');
      result = { root: group, animations: group.animations ?? [] };
      warnings.push('FBX support is experimental. If something looks wrong, export the model as GLB instead.');
    } else {
      throw new UserFacingError('import-format', 'This file is not a 3D model.');
    }
    // OBJ/FBX textures load asynchronously through the manager; wait for them.
    await sandbox.settled();
    if (blocked.length > 0) {
      warnings.push(
        `${blocked.length} external file reference(s) could not be resolved and were skipped. Select the model's texture/buffer files together with it.`,
      );
    }
    return result;
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    throw new UserFacingError(
      'import-parse',
      'This model could not be read. It may be damaged or use unsupported features.',
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
  } finally {
    setTimeout(() => sandbox.revoke(), 5000);
  }
}
