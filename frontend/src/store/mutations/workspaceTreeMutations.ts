// frontend/src/store/mutations/workspaceTreeMutations.ts
import { BlockGroupNodeDto, TextureAliasDto, PackStatsDto } from '../../types/ipc';
import { normalizePath } from '../../utils/pathUtils';

export function computeStats(aliases: TextureAliasDto[]): PackStatsDto {
  const total = aliases.length;
  const done = aliases.filter((a) => a.status === 'OK').length;
  const ghosts = aliases.filter((a) => a.status === 'GHOST').length;
  const orphans = aliases.filter((a) => a.status === 'ORPHAN').length;
  const blocks = aliases.filter((a) => a.category === 'block');
  const items = aliases.filter((a) => a.category === 'item');
  const entities = aliases.filter((a) => a.category === 'entity');

  return {
    totalCount: total,
    okCount: done,
    ghostCount: ghosts,
    orphanCount: orphans,
    blocksCount: blocks.length,
    itemsCount: items.length,
    entitiesCount: entities.length,
    blocksGhostCount: blocks.filter((a) => a.status === 'GHOST').length,
    itemsGhostCount: items.filter((a) => a.status === 'GHOST').length,
    entitiesGhostCount: entities.filter((a) => a.status === 'GHOST').length,
    total,
    done,
    ghosts,
    orphans,
  };
}

export interface TreeMutationResult {
  aliases: TextureAliasDto[];
  blockWorkspaceTree: BlockGroupNodeDto[];
  entityWorkspaceTree: BlockGroupNodeDto[];
  catalogTree?: BlockGroupNodeDto[];
  stats: PackStatsDto;
}

export function applyOptimisticDeleteTexture(
  aliases: TextureAliasDto[],
  blockTree: BlockGroupNodeDto[],
  entityTree: BlockGroupNodeDto[],
  fullPath: string,
  aliasKey?: string
): TreeMutationResult {
  const targetNorm = normalizePath(fullPath, true);

  const isAliasMatchForEmptyPath = (alias: TextureAliasDto) =>
    aliasKey && alias.alias.toLowerCase() === aliasKey.toLowerCase();

  const updatedAliases: TextureAliasDto[] = aliases.map((alias) => {
    let isMatch = false;
    if (targetNorm && alias.fullPath && normalizePath(alias.fullPath, true) === targetNorm) {
      isMatch = true;
    } else if (!targetNorm && isAliasMatchForEmptyPath(alias)) {
      isMatch = true;
    }
    if (!isMatch) return alias;

    return {
      ...alias,
      status: 'GHOST' as const,
      exists: false,
      imageUrl: '',
    };
  });

  const patchDelete = (tree: BlockGroupNodeDto[]): BlockGroupNodeDto[] =>
    (tree || []).map((block) => ({
      ...block,
      aliasGroups: block.aliasGroups?.map((ag) => ({
        ...ag,
        faceNodes: (ag as any).faceNodes?.map((fn: any) => ({
          ...fn,
          leaves: fn.leaves?.map((leaf: any) => {
            const leafMatch = leaf.fullPath && normalizePath(leaf.fullPath, true) === targetNorm;
            if (leafMatch) return { ...leaf, status: 'GHOST' as const, imageUrl: '' };
            return leaf;
          }),
        })),
        leaves: ag.leaves?.map((leaf: any) => {
          const leafMatch = leaf.fullPath && normalizePath(leaf.fullPath, true) === targetNorm;
          if (leafMatch) return { ...leaf, status: 'GHOST' as const, imageUrl: '' };
          return leaf;
        }),
      })),
    }));

  return {
    aliases: updatedAliases,
    blockWorkspaceTree: patchDelete(blockTree),
    entityWorkspaceTree: patchDelete(entityTree),
    stats: computeStats(updatedAliases),
  };
}

export function applyOptimisticDeleteEntries(
  aliases: TextureAliasDto[],
  blockTree: BlockGroupNodeDto[],
  entityTree: BlockGroupNodeDto[],
  catalogTree: BlockGroupNodeDto[] | null | undefined,
  aliasKey: string,
  category: string,
  relativePath?: string
): TreeMutationResult {
  const stripExt = (p?: string | null) =>
    normalizePath(p || '', true).replace(/\.(png|tga|jpg|jpeg|webp)$/i, '');
  const relNorm = stripExt(relativePath);
  const keyNorm = aliasKey.toLowerCase();
  const catNorm = category.toLowerCase();

  const updatedAliases: TextureAliasDto[] = [];
  for (const alias of aliases) {
    const isAliasMatch = alias.alias.toLowerCase() === keyNorm && alias.category.toLowerCase() === catNorm;
    const isPathMatch = Boolean(relNorm && alias.relativePath && stripExt(alias.relativePath) === relNorm);
    const isTarget = isAliasMatch || (Boolean(relNorm) && isPathMatch && alias.category.toLowerCase() === catNorm);

    if (!isTarget) {
      updatedAliases.push(alias);
      continue;
    }

    const hasPhysicalFile =
      alias.status === 'OK' ||
      alias.status === 'OVERRIDE' ||
      alias.status === 'ORPHAN' ||
      (Boolean(alias.exists) && alias.status !== 'GHOST');
    if (hasPhysicalFile) {
      updatedAliases.push({
        ...alias,
        status: 'ORPHAN',
        variantKind: 'None',
        isUserDefined: false,
        subtitleCaption: 'orphan texture',
      });
    }
  }

  const transformTree = (tree: BlockGroupNodeDto[]): BlockGroupNodeDto[] =>
    (tree || []).map((block) => {
      const newAliasGroups = (block.aliasGroups || []).map((ag) => {
        const isAgMatch = ag.alias.toLowerCase() === keyNorm && (ag.category || block.category).toLowerCase() === catNorm;

        if (!isAgMatch) {
          if (relNorm) {
            const filteredLeaves = ag.leaves?.filter((l) => stripExt(l.relativePath) !== relNorm) ?? ag.leaves;
            const faceNodes = (ag as any).faceNodes?.map((fn: any) => ({
              ...fn,
              leaves: fn.leaves?.filter((l: any) => stripExt(l.relativePath) !== relNorm),
            }));
            return { ...ag, leaves: filteredLeaves, faceNodes } as any;
          }
          return ag;
        }

        const allLeaves = [
          ...(ag.leaves ?? []),
          ...(ag.faceNodes ? ag.faceNodes.flatMap((fn) => fn.leaves ?? []) : []),
        ];
        const hasTextures = allLeaves.some((l) => l.status === 'OK' || l.status === 'OVERRIDE' || l.status === 'ORPHAN');

        if (hasTextures) {
          const updatedLeaves = (ag.leaves ?? [])
            .filter((l) => l.status === 'OK' || l.status === 'OVERRIDE' || l.status === 'ORPHAN')
            .map((l) => ({ ...l, status: 'ORPHAN' as any, isUserDefined: false }));

          const updatedFaceNodes = (ag.faceNodes ?? []).map((fn) => ({
            ...fn,
            leaves: (fn.leaves ?? [])
              .filter((l) => l.status === 'OK' || l.status === 'OVERRIDE' || l.status === 'ORPHAN')
              .map((l) => ({ ...l, status: 'ORPHAN' as any, isUserDefined: false })),
          }));

          return {
            ...ag,
            isUserDefined: false,
            leaves: updatedLeaves,
            faceNodes: updatedFaceNodes,
            ghostCount: 0,
          };
        }

        return null;
      }).filter(Boolean) as any[];

      return {
        ...block,
        aliasGroups: newAliasGroups,
      };
    });

  const updatedBlockTree = transformTree(blockTree);
  const updatedEntityTree = transformTree(entityTree);

  const patchCatalogTree = (tree: BlockGroupNodeDto[]): BlockGroupNodeDto[] =>
    (tree || []).map((block) => {
      let blockNotAdded = 0;
      let hasAgMatch = false;

      const newAliasGroups = (block.aliasGroups || []).map((ag) => {
        const isAgMatch = ag.alias.toLowerCase() === keyNorm && (ag.category || block.category || '').toLowerCase() === catNorm;
        if (!isAgMatch) {
          blockNotAdded += ag.notAddedCount ?? (ag.leaves?.filter((l) => l.status === 'VANILLA').length ?? 0);
          return ag;
        }
        hasAgMatch = true;

        const newLeaves = (ag.leaves || []).map((l) => {
          const isLeafMatch = !relNorm || stripExt(l.relativePath) === relNorm;
          if (!isLeafMatch) return l;

          const hasPhysical = updatedAliases.some(
            (a) => a.alias.toLowerCase() === keyNorm && (a.status === 'OK' || a.status === 'ORPHAN' || a.status === 'OVERRIDE')
          );
          if (hasPhysical) {
            return { ...l, status: 'ORPHAN' as any };
          }
          return { ...l, status: 'VANILLA' as any };
        });

        const agNotAdded = newLeaves.filter((l) => l.status === 'VANILLA').length;
        blockNotAdded += agNotAdded;

        return {
          ...ag,
          leaves: newLeaves,
          notAddedCount: agNotAdded,
          ghostCount: newLeaves.filter((l) => l.status === 'GHOST').length,
        };
      });

      if (!hasAgMatch) return block;

      return {
        ...block,
        aliasGroups: newAliasGroups,
        notAddedCount: blockNotAdded,
      };
    });

  const updatedCatalogTree = patchCatalogTree(catalogTree || []);

  return {
    aliases: updatedAliases,
    blockWorkspaceTree: updatedBlockTree,
    entityWorkspaceTree: updatedEntityTree,
    catalogTree: updatedCatalogTree,
    stats: computeStats(updatedAliases),
  };
}

export function applyOptimisticDeleteVariation(
  aliases: TextureAliasDto[],
  blockTree: BlockGroupNodeDto[],
  entityTree: BlockGroupNodeDto[],
  alias: string,
  relativePath: string
): TreeMutationResult {
  const relNorm = normalizePath(relativePath, true);
  const aliasNorm = alias.toLowerCase();

  const updatedAliases = aliases.filter((a) => {
    if (a.alias.toLowerCase() === aliasNorm && a.relativePath && normalizePath(a.relativePath, true) === relNorm) {
      return false;
    }
    return true;
  });

  const patchDeleteVariation = (tree: BlockGroupNodeDto[]): BlockGroupNodeDto[] =>
    (tree || []).map((block) => ({
      ...block,
      aliasGroups: block.aliasGroups?.map((ag) => {
        if (ag.alias.toLowerCase() !== aliasNorm) return ag;
        const filteredLeaves = ag.leaves?.filter((leaf) => !(leaf.relativePath && normalizePath(leaf.relativePath, true) === relNorm));
        const faceNodes = (ag as any).faceNodes?.map((fn: any) => ({
          ...fn,
          leaves: fn.leaves?.filter((leaf: any) => !(leaf.relativePath && normalizePath(leaf.relativePath, true) === relNorm)),
        }));
        return { ...ag, leaves: filteredLeaves, faceNodes } as any;
      }),
    }));

  return {
    aliases: updatedAliases,
    blockWorkspaceTree: patchDeleteVariation(blockTree),
    entityWorkspaceTree: patchDeleteVariation(entityTree),
    stats: computeStats(updatedAliases),
  };
}

export function applyOptimisticAddVariation(
  aliases: TextureAliasDto[],
  blockTree: BlockGroupNodeDto[],
  entityTree: BlockGroupNodeDto[],
  alias: string,
  blockVariantIndex?: number | null,
  count = 1
): TreeMutationResult {
  const aliasNorm = alias.toLowerCase();
  const existing = aliases.filter((a) => a.alias.toLowerCase() === aliasNorm);
  const nextIndex = existing.length > 0 ? Math.max(...existing.map((e) => e.textureVariantIndex ?? 0)) + 1 : 1;

  const newAliases: TextureAliasDto[] = [...aliases];
  for (let i = 0; i < count; i++) {
    const varIndex = nextIndex + i;
    const stubRelativePath = `textures/blocks/${alias}_var${varIndex}.png`;
    newAliases.push({
      alias,
      displayName: `${alias} #${varIndex}`,
      category: 'block',
      relativePath: stubRelativePath,
      fullPath: '',
      status: 'GHOST',
      exists: false,
      imageUrl: '',
      variantKind: 'TextureVariant',
      textureVariantIndex: varIndex,
      totalTextureVariants: nextIndex + count,
      blockVariantIndex: blockVariantIndex ?? null,
      blockFaces: [],
      usedByBlocks: [],
      isFlipbook: false,
      primaryFaceBadgeText: '',
      subtitleCaption: '',
      key: `${alias}_var${varIndex}`,
    });
  }

  const injectVariation = (tree: BlockGroupNodeDto[]): BlockGroupNodeDto[] =>
    (tree || []).map((block) => ({
      ...block,
      aliasGroups: block.aliasGroups?.map((ag) => {
        if (ag.alias.toLowerCase() !== aliasNorm) return ag;
        const leaves = [...(ag.leaves || [])];
        for (let i = 0; i < count; i++) {
          const varIndex = nextIndex + i;
          leaves.push({
            alias,
            displayName: `${alias} #${varIndex}`,
            category: 'block',
            relativePath: `textures/blocks/${alias}_var${varIndex}.png`,
            fullPath: '',
            status: 'GHOST',
            imageUrl: '',
            subtitleCaption: '',
            primaryFaceBadgeText: '',
            isFlipbook: false,
            variantKind: 'TextureVariant',
            textureVariantIndex: varIndex,
            totalTextureVariants: nextIndex + count,
            blockVariantIndex: blockVariantIndex ?? null,
          });
        }
        const faceNodes = (ag as any).faceNodes?.map((fn: any) => fn);
        return {
          ...ag,
          leaves,
          faceNodes,
        } as any;
      }),
    }));

  return {
    aliases: newAliases,
    blockWorkspaceTree: injectVariation(blockTree),
    entityWorkspaceTree: injectVariation(entityTree),
    stats: computeStats(newAliases),
  };
}

export function applyOptimisticAddVanillaEntry(
  aliases: TextureAliasDto[],
  blockTree: BlockGroupNodeDto[],
  entityTree: BlockGroupNodeDto[],
  catalogTree: BlockGroupNodeDto[] | null | undefined,
  id: string,
  category: string,
  alias?: string,
  catalogNode?: BlockGroupNodeDto | null
): TreeMutationResult {
  const catNorm = category.toLowerCase();
  const targetIsAliasOnly = Boolean(alias);
  const targetAliasNorm = (alias || id).toLowerCase();

  const newAliases: TextureAliasDto[] = [...aliases];
  const existingKeys = new Set(
    newAliases.map(
      (a) =>
        `${a.alias.toLowerCase()}|${(a.relativePath || '').toLowerCase()}|${a.textureVariantIndex ?? ''}|${a.blockVariantIndex ?? ''}`
    )
  );

  const pushLeafAsAlias = (leaf: any) => {
    const key = `${leaf.alias.toLowerCase()}|${(leaf.relativePath || '').toLowerCase()}|${leaf.textureVariantIndex ?? ''}|${leaf.blockVariantIndex ?? ''}`;
    if (existingKeys.has(key)) {
      const idx = newAliases.findIndex(
        (a) =>
          `${a.alias.toLowerCase()}|${(a.relativePath || '').toLowerCase()}|${a.textureVariantIndex ?? ('' as any)}|${a.blockVariantIndex ?? ('' as any)}` ===
          key
      );
      if (idx >= 0) {
        const existing = newAliases[idx]!;
        newAliases[idx] = {
          ...existing,
          isUserDefined: true,
          status: existing.status === 'ORPHAN' ? ('GHOST' as any) : existing.status,
        } as any;
      }
      return;
    }
    existingKeys.add(key);
    newAliases.push({
      alias: leaf.alias,
      displayName: leaf.displayName || leaf.alias,
      category: (leaf.category as any) || (catNorm as any),
      relativePath:
        leaf.relativePath ||
        `textures/${catNorm === 'block' ? 'blocks' : catNorm === 'item' ? 'items' : 'entity'}/${leaf.alias}.png`,
      fullPath: leaf.fullPath || '',
      status: 'GHOST' as any,
      exists: false,
      imageUrl: '',
      variantKind: leaf.variantKind || 'None',
      textureVariantIndex: leaf.textureVariantIndex ?? null,
      totalTextureVariants: leaf.totalTextureVariants ?? null,
      blockVariantIndex: leaf.blockVariantIndex ?? null,
      totalBlockVariants: leaf.totalBlockVariants ?? null,
      blockFaces: [],
      usedByBlocks: [],
      isFlipbook: Boolean(leaf.isFlipbook),
      flipbook: leaf.flipbook ?? null,
      primaryFaceBadgeText: leaf.primaryFaceBadgeText || '',
      subtitleCaption: leaf.subtitleCaption || '',
      isUserDefined: true,
      key: `${leaf.alias}_${leaf.relativePath}`,
      hasMers: (leaf as any).hasMers,
      mersFullPath: (leaf as any).mersFullPath,
      hasAtlas: (leaf as any).hasAtlas,
      atlasFullPath: (leaf as any).atlasFullPath,
    } as any);
  };

  if (catalogNode) {
    for (const ag of catalogNode.aliasGroups || []) {
      if (targetIsAliasOnly && ag.alias.toLowerCase() !== targetAliasNorm) continue;
      const leaves = ag.leaves && ag.leaves.length > 0 ? ag.leaves : [];
      const allLeaves = [...leaves, ...((ag as any).faceNodes?.flatMap((fn: any) => fn.leaves ?? []) ?? [])];
      for (const leaf of allLeaves) {
        pushLeafAsAlias(leaf);
      }
      if (allLeaves.length === 0 && ag.alias) {
        pushLeafAsAlias({
          alias: ag.alias,
          displayName: ag.alias,
          relativePath: `textures/${catNorm === 'block' ? 'blocks' : 'items'}/${ag.alias}.png`,
          category: catNorm,
          status: 'GHOST',
        } as any);
      }
    }
  } else if (targetIsAliasOnly) {
    let matchedAg: any = null;
    if (catalogTree) {
      for (const b of catalogTree) {
        const found = b.aliasGroups?.find((ag) => ag.alias.toLowerCase() === targetAliasNorm);
        if (found && found.leaves && found.leaves.length > 0) {
          matchedAg = found;
          break;
        }
      }
    }

    if (matchedAg && matchedAg.leaves && matchedAg.leaves.length > 0) {
      for (const leaf of matchedAg.leaves) {
        pushLeafAsAlias(leaf);
      }
    } else {
      const rel = `textures/${catNorm === 'block' ? 'blocks' : catNorm === 'item' ? 'items' : 'entity'}/${alias}.png`;
      pushLeafAsAlias({ alias: alias!, displayName: alias!, relativePath: rel, category: catNorm, status: 'GHOST' } as any);
    }
  }

  const cloneNodeForWorkspace = (node: BlockGroupNodeDto): BlockGroupNodeDto => ({
    blockId: node.blockId,
    displayName: node.displayName || node.blockId,
    category: node.category,
    ghostCount:
      node.aliasGroups?.reduce(
        (s, ag) => s + (ag.leaves?.filter((l) => l.status === 'GHOST' || l.status === 'VANILLA').length ?? 0),
        0
      ) ?? 0,
    totalVariants: node.totalVariants ?? node.aliasGroups?.length ?? 0,
    isUserDefined: true,
    aliasGroups: (node.aliasGroups || [])
      .filter((ag) => !targetIsAliasOnly || ag.alias.toLowerCase() === targetAliasNorm)
      .map((ag) => ({
        ...ag,
        leaves: (ag.leaves || []).map((leaf) => ({
          ...leaf,
          status: (leaf.status === 'VANILLA' ? 'GHOST' : leaf.status) as any,
          fullPath: '',
          imageUrl: '',
        })),
        faceNodes: (ag as any).faceNodes?.map((fn: any) => ({
          ...fn,
          leaves: fn.leaves?.map((l: any) => ({
            ...l,
            status: (l.status === 'VANILLA' ? 'GHOST' : l.status) as any,
            fullPath: '',
            imageUrl: '',
          })),
        })) as any,
      })),
  });

  let updatedBlockTree = blockTree || [];
  let updatedEntityTree = entityTree || [];

  if (catalogNode && !targetIsAliasOnly) {
    if (catNorm === 'entity') {
      const exists = updatedEntityTree.some((b) => b.blockId.toLowerCase() === id.toLowerCase());
      if (!exists) {
        updatedEntityTree = [...updatedEntityTree, cloneNodeForWorkspace(catalogNode)];
      } else {
        updatedEntityTree = updatedEntityTree.map((b) =>
          b.blockId.toLowerCase() === id.toLowerCase() ? { ...b, isUserDefined: true } : b
        );
      }
    } else {
      const exists = updatedBlockTree.some((b) => b.blockId.toLowerCase() === id.toLowerCase());
      if (!exists) {
        updatedBlockTree = [...updatedBlockTree, cloneNodeForWorkspace(catalogNode)];
        updatedBlockTree = [...updatedBlockTree].sort((a, b) =>
          (a.displayName || a.blockId).localeCompare(b.displayName || b.blockId)
        );
      } else {
        updatedBlockTree = updatedBlockTree.map((b) =>
          b.blockId.toLowerCase() === id.toLowerCase() ? { ...b, isUserDefined: true } : b
        );
        const existing = updatedBlockTree.find((b) => b.blockId.toLowerCase() === id.toLowerCase());
        if (existing && catalogNode.aliasGroups?.length) {
          const missingGroups = catalogNode.aliasGroups.filter(
            (ag) => !existing.aliasGroups.some((eag) => eag.alias.toLowerCase() === ag.alias.toLowerCase())
          );
          if (missingGroups.length > 0) {
            updatedBlockTree = updatedBlockTree.map((b) =>
              b.blockId.toLowerCase() === id.toLowerCase()
                ? {
                    ...b,
                    aliasGroups: [
                      ...(b.aliasGroups || []),
                      ...missingGroups.map((ag) => ({
                        ...ag,
                        leaves: ag.leaves?.map((l) => ({
                          ...l,
                          status: 'GHOST' as any,
                          fullPath: '',
                          imageUrl: '',
                        })),
                      })),
                    ],
                  }
                : b
            );
          }
        }
      }
    }
  } else if (targetIsAliasOnly && catalogNode) {
    const patchTreeForAlias = (tree: BlockGroupNodeDto[]): BlockGroupNodeDto[] =>
      tree.map((block) => {
        let patched = false;
        const newAliasGroups = block.aliasGroups?.map((ag) => {
          if (ag.alias.toLowerCase() !== targetAliasNorm) return ag;
          patched = true;
          return {
            ...ag,
            leaves: ag.leaves?.map((l) => ({
              ...l,
              status: l.status === 'VANILLA' ? ('GHOST' as any) : l.status,
              fullPath: l.fullPath || '',
            })),
            faceNodes: (ag as any).faceNodes?.map((fn: any) => ({
              ...fn,
              leaves: fn.leaves?.map((l: any) => ({
                ...l,
                status: l.status === 'VANILLA' ? ('GHOST' as any) : l.status,
              })),
            })),
          } as any;
        });
        return patched ? { ...block, aliasGroups: newAliasGroups as any } : block;
      });
    if (catNorm === 'entity') updatedEntityTree = patchTreeForAlias(updatedEntityTree);
    else updatedBlockTree = patchTreeForAlias(updatedBlockTree);
  }

  const updatedCatalogTree = (catalogTree || []).map((cb) => {
    const isTargetBlock =
      (!targetIsAliasOnly && cb.blockId.toLowerCase() === id.toLowerCase() && (cb.category || '').toLowerCase() === catNorm) ||
      (targetIsAliasOnly && cb.aliasGroups?.some((ag) => ag.alias.toLowerCase() === targetAliasNorm));

    if (!isTargetBlock) return cb;

    const newAliasGroups = (cb.aliasGroups || []).map((ag) => {
      if (targetIsAliasOnly && ag.alias.toLowerCase() !== targetAliasNorm) return ag;

      const updatedLeaves = ag.leaves?.map((l) => (l.status === 'VANILLA' ? { ...l, status: 'GHOST' as const } : l));
      const updatedFaceNodes = (ag as any).faceNodes?.map((fn: any) => ({
        ...fn,
        leaves: fn.leaves?.map((l: any) => (l.status === 'VANILLA' ? { ...l, status: 'GHOST' as const } : l)),
      }));

      const notAddedCount = 0;
      const ghostCount =
        (updatedLeaves?.filter((l) => l.status === 'GHOST').length ?? 0) +
        (updatedFaceNodes?.reduce(
          (acc: number, fn: any) => acc + (fn.leaves?.filter((l: any) => l.status === 'GHOST').length ?? 0),
          0
        ) ?? 0);

      return {
        ...ag,
        leaves: updatedLeaves,
        faceNodes: updatedFaceNodes,
        notAddedCount,
        ghostCount: ghostCount > 0 ? ghostCount : ag.ghostCount,
      } as any;
    });

    return {
      ...cb,
      aliasGroups: newAliasGroups,
    };
  });

  return {
    aliases: newAliases,
    blockWorkspaceTree: updatedBlockTree,
    entityWorkspaceTree: updatedEntityTree,
    catalogTree: updatedCatalogTree,
    stats: computeStats(newAliases),
  };
}
