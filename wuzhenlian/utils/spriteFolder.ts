import type { Character, CustomFolder, StageSprite } from '../types';

/** 与 App 中立绘匹配规则一致 */
export function normSpriteFolderKey(s: string | undefined | null): string {
  return (
    String(s ?? '')
      .replace(/\u3000/g, ' ')
      .replace(/[-‐‑‒–—]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
}

/** 仅按立绘库 id/name 命中（不含 runtime 角色别名） */
function getSpriteFolderKindCore(charId: string, library: CustomFolder[] | undefined): 'fullbody' | 'avatar' {
  const lib = library || [];
  const sidNorm = normSpriteFolderKey(charId);
  const playerNorm = normSpriteFolderKey('Player');
  if (sidNorm === playerNorm || ['user', '{{user}}', '主角', '玩家'].includes(sidNorm)) {
    const folder =
      lib.find(f => String(f.id || '').trim().toLowerCase() === 'player') ||
      lib.find(
        f =>
          normSpriteFolderKey(f.name) === 'user' ||
          normSpriteFolderKey(f.name) === normSpriteFolderKey('主角'),
      );
    return folder?.spriteFolderKind === 'avatar' ? 'avatar' : 'fullbody';
  }
  const folder = lib.find(
    f =>
      !f.disabled &&
      (normSpriteFolderKey(f.name) === sidNorm || normSpriteFolderKey(String(f.id)) === sidNorm),
  );
  return folder?.spriteFolderKind === 'avatar' ? 'avatar' : 'fullbody';
}

/**
 * 根据立绘库文件夹类型判定是否走「头像立绘」层。
 * `characters` 用于槽位 characterId 与文件夹名不完全一致时（如 UUID vs 显示名）的二次匹配。
 */
export function getSpriteFolderKind(
  charId: string,
  library: CustomFolder[] | undefined,
  characters?: Character[],
): 'fullbody' | 'avatar' {
  if (getSpriteFolderKindCore(charId, library) === 'avatar') return 'avatar';
  if (!characters?.length) return 'fullbody';
  const sidNorm = normSpriteFolderKey(charId);
  const char = characters.find(
    c => normSpriteFolderKey(String(c.id)) === sidNorm || normSpriteFolderKey(c.name) === sidNorm,
  );
  if (!char) return 'fullbody';
  if (getSpriteFolderKindCore(String(char.id), library) === 'avatar') return 'avatar';
  if (getSpriteFolderKindCore(char.name, library) === 'avatar') return 'avatar';
  return 'fullbody';
}

/** 与 DialogueBox.parseStand 一致：从 instanceId 取 L/C/R */
export function slotKeyFromSpriteInstanceId(instanceId: string): 'left' | 'center' | 'right' {
  const a = /^gal_avatar_(left|center|right)_/i.exec(instanceId);
  if (a?.[1]) return a[1].toLowerCase() as 'left' | 'center' | 'right';
  const b = /^gal_(left|center|right)_/i.exec(instanceId);
  if (b?.[1]) return b[1].toLowerCase() as 'left' | 'center' | 'right';
  return 'center';
}

/**
 * 按立绘库类型强制头像层字段，避免槽位 id 与文件夹 key 不一致时仍落在全身层（z-10）被对话框压住。
 */
export function normalizeSpriteForAvatarFolder(
  sprite: StageSprite,
  library: CustomFolder[] | undefined,
  characters?: Character[],
): StageSprite {
  const cid = String(sprite.characterId ?? '').trim();
  if (!cid) return sprite;
  if (getSpriteFolderKind(cid, library, characters) !== 'avatar') return sprite;

  const pos = slotKeyFromSpriteInstanceId(sprite.instanceId);
  return {
    ...sprite,
    layer: 'avatar',
    instanceId: `gal_avatar_${pos}_${cid}`,
    x: 0,
    y: 0,
    scale: 1,
    zIndex: 56,
  };
}

export function normalizeStageSpritesForAvatarFolder(
  sprites: StageSprite[],
  library: CustomFolder[] | undefined,
  characters?: Character[],
): StageSprite[] {
  return sprites.map(s => normalizeSpriteForAvatarFolder(s, library, characters));
}
