import { encodeProjectId } from './identifiers.js';
import { getWorkspaceName, listCodexSessionRecords } from './sessionFiles.js';
import type { Project } from './types.js';

export const getProjects = async (): Promise<{ projects: Project[] }> => {
  const records = await listCodexSessionRecords();
  const workspaceMap = new Map<string, typeof records>();

  for (const record of records) {
    if (!record.workspacePath) {
      continue;
    }

    const sessions = workspaceMap.get(record.workspacePath);
    if (sessions) {
      sessions.push(record);
    } else {
      workspaceMap.set(record.workspacePath, [record]);
    }
  }

  const projects: Project[] = Array.from(workspaceMap.entries()).map(
    ([workspacePath, sessions]) => {
      const id = encodeProjectId(workspacePath);
      const lastSessionAt = sessions.reduce<Date | null>((acc, record) => {
        if (!record.lastModifiedAt) return acc;
        if (!acc || record.lastModifiedAt > acc) {
          return record.lastModifiedAt;
        }
        return acc;
      }, null);

      return {
        id,
        workspacePath,
        meta: {
          workspaceName: getWorkspaceName(workspacePath),
          workspacePath,
          lastSessionAt,
          sessionCount: sessions.length,
        },
      } satisfies Project;
    },
  );

  projects.sort((a, b) => {
    const aTime = a.meta.lastSessionAt?.getTime() ?? 0;
    const bTime = b.meta.lastSessionAt?.getTime() ?? 0;
    return bTime - aTime;
  });

  return { projects };
};
