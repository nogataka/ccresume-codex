import React from 'react';
import { Box, Text } from 'ink';
import { format } from 'date-fns';
import type { Project } from '../codex/types.js';

interface ProjectPreviewProps {
  project: Project | null;
  statusMessage?: string | null;
}

export const ProjectPreview: React.FC<ProjectPreviewProps> = ({ project, statusMessage }) => {
  if (!project) {
    return (
      <Box borderStyle="single" borderColor="green" flexDirection="column" paddingX={1} paddingY={0} flexGrow={1}>
        <Text color="gray">Codex のセッションを含むプロジェクトが見つかりませんでした。</Text>
        <Text color="gray">Codex CLI で会話を開始すると、ここに一覧が表示されます。</Text>
      </Box>
    );
  }

  const { workspaceName, workspacePath, sessionCount, lastSessionAt } = project.meta;
  const lastSessionText = lastSessionAt ? format(lastSessionAt, 'yyyy-MM-dd HH:mm') : '未記録';

  return (
    <Box borderStyle="single" borderColor="green" flexDirection="column" paddingX={1} paddingY={0} flexGrow={1}>
      <Text bold color="green">Project Overview</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text bold>名前: </Text>
          {workspaceName}
        </Text>
        <Text>
          <Text bold>ディレクトリ: </Text>
          {workspacePath}
        </Text>
        <Text>
          <Text bold>セッション数: </Text>
          {sessionCount}
        </Text>
        <Text>
          <Text bold>最終セッション: </Text>
          {lastSessionText}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>Enter でこのプロジェクトのセッション一覧に移動します。</Text>
        <Text dimColor>Esc / Backspace でプロジェクト一覧に戻れます。</Text>
      </Box>
      {statusMessage && (
        <Box marginTop={1}>
          <Text color="yellow">{statusMessage}</Text>
        </Box>
      )}
    </Box>
  );
};

export default ProjectPreview;
