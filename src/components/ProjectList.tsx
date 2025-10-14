import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { format } from 'date-fns';
import type { Project } from '../codex/types.js';
import { getStringDisplayLength } from '../utils/stringUtils.js';
import { strictTruncateByWidth } from '../utils/strictTruncate.js';

interface ProjectListProps {
  projects: Project[];
  selectedIndex: number;
  maxVisible?: number;
  isLoading?: boolean;
  totalCount?: number;
  searchActive?: boolean;
  searchQuery?: string;
}

const DEFAULT_VISIBLE = 6;

export const ProjectList: React.FC<ProjectListProps> = ({
  projects,
  selectedIndex,
  maxVisible = DEFAULT_VISIBLE,
  isLoading = false,
  totalCount,
  searchActive = false,
  searchQuery = '',
}) => {
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;

  const safeSelectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(projects.length - 1, 0)));

  let startIndex = 0;
  let endIndex = projects.length;

  if (projects.length > maxVisible) {
    const halfWindow = Math.floor(maxVisible / 2);
    startIndex = Math.max(0, safeSelectedIndex - halfWindow);
    endIndex = Math.min(projects.length, startIndex + maxVisible);

    if (endIndex === projects.length) {
      startIndex = Math.max(0, endIndex - maxVisible);
    }
  }

  const visibleProjects = projects.slice(startIndex, endIndex);
  const hasMoreBelow = endIndex < projects.length;
  const effectiveTotal = totalCount ?? projects.length;
  const trimmedQuery = searchQuery.trim();

  const headerText = isLoading
    ? 'Loading projects...'
    : searchActive
      ? `Search results: ${projects.length}/${effectiveTotal}`
      : `Select a project${effectiveTotal > 0 ? ` (${effectiveTotal} total)` : ''}:`;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} width="100%" overflow="hidden">
      <Text bold color="cyan">{headerText}</Text>

      {searchActive && !isLoading && (
        <Text color="gray">{trimmedQuery ? `Query: "${trimmedQuery}"` : 'Hit keys to filter projects'}</Text>
      )}

      {isLoading ? (
        <Box height={maxVisible} />
      ) : projects.length === 0 ? (
        <Text color="gray">
          {searchActive && trimmedQuery
            ? `No projects matched "${trimmedQuery}"`
            : 'No Codex projects detected'}
        </Text>
      ) : (
        visibleProjects.map((project, visibleIndex) => {
          const actualIndex = startIndex + visibleIndex;
          const isSelected = actualIndex === safeSelectedIndex;

          const selector = isSelected ? '▶ ' : '  ';
          const timestamp = project.meta.lastSessionAt
            ? format(project.meta.lastSessionAt, 'MMM dd HH:mm')
            : '-- -- --:--';
          const header = `${selector}${timestamp} | ${project.meta.workspaceName}`;
          const fixedLength = getStringDisplayLength(header);

          const suffix = `Sessions: ${project.meta.sessionCount}`;
          const totalMargin = 16;
          const availableSpace = Math.max(20, terminalWidth - fixedLength - suffix.length - totalMargin);

          const truncatedPath = strictTruncateByWidth(project.workspacePath, availableSpace);

          const line = `${header} | ${truncatedPath} | ${suffix}`;
          const maxLineWidth = terminalWidth - totalMargin;
          const safeLine = strictTruncateByWidth(line, maxLineWidth);

          return (
            <Box key={project.id} width="100%" overflow="hidden">
              <Text
                color={isSelected ? 'black' : 'white'}
                backgroundColor={isSelected ? 'cyan' : undefined}
                bold={isSelected}
              >
                {safeLine}
              </Text>
            </Box>
          );
        })
      )}

      {hasMoreBelow && (
        <Box width="100%">
          <Text color="cyan">↓ {projects.length - endIndex} more...</Text>
        </Box>
      )}
    </Box>
  );
};

export default ProjectList;
