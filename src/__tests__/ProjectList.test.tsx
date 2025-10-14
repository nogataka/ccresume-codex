import React from 'react';
import { render } from 'ink-testing-library';
import { ProjectList } from '../components/ProjectList.js';
import type { Project } from '../codex/types.js';

describe('ProjectList', () => {
  const baseProject: Project = {
    id: 'proj-1',
    workspacePath: '/workspace/project-one',
    meta: {
      workspaceName: 'project-one',
      workspacePath: '/workspace/project-one',
      lastSessionAt: new Date('2024-01-01T00:00:00Z'),
      sessionCount: 4
    }
  };

  it('renders search feedback when no projects match', () => {
    const { lastFrame } = render(
      <ProjectList
        projects={[]}
        selectedIndex={0}
        isLoading={false}
        totalCount={1}
        searchActive
        searchQuery="infra"
      />
    );

    const output = lastFrame();
    expect(output).toContain('Search results: 0/1');
    expect(output).toContain('No projects matched "infra"');
  });

  it('shows project details when available', () => {
    const { lastFrame } = render(
      <ProjectList
        projects={[baseProject]}
        selectedIndex={0}
        isLoading={false}
        totalCount={1}
      />
    );

    const output = lastFrame();
    expect(output).toContain('Select a project (1 total):');
    expect(output).toContain('project-one');
    expect(output).toContain('/workspace/project-one');
  });
});
