import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import { ConversationList } from './components/ConversationList.js';
import { ConversationPreview } from './components/ConversationPreview.js';
import { ConversationPreviewFull } from './components/ConversationPreviewFull.js';
import { CommandEditor } from './components/CommandEditor.js';
import { ProjectList } from './components/ProjectList.js';
import { ProjectPreview } from './components/ProjectPreview.js';
import { getPaginatedConversations, getAllConversations } from './utils/conversationReader.js';
import { getProjects } from './codex/projectService.js';
import { spawn } from 'child_process';
import clipboardy from 'clipboardy';
import type { Conversation } from './types.js';
import type { Project } from './codex/types.js';
import { loadConfig } from './utils/configLoader.js';
import { matchesKeyBinding } from './utils/keyBindingHelper.js';
import type { Config } from './types/config.js';

interface AppProps {
  codexArgs?: string[];
  currentDirOnly?: boolean;
  hideOptions?: string[];
}

// Layout constants
const ITEMS_PER_PAGE = 30;
const HEADER_HEIGHT = 2; // Title + pagination info
const LIST_MAX_HEIGHT = 9; // Maximum height for conversation list
const LIST_BASE_HEIGHT = 3; // Borders (2) + title (1)
const MAX_VISIBLE_CONVERSATIONS = 4; // Maximum conversations shown per page
const BOTTOM_MARGIN = 1; // Bottom margin to absorb overflow
const SAFETY_MARGIN = 1; // Prevents Ink from clearing terminal when output approaches height limit
const MIN_PREVIEW_HEIGHT = 10; // Minimum height for conversation preview
const DEFAULT_TERMINAL_WIDTH = 80;
const DEFAULT_TERMINAL_HEIGHT = 24;
const EXECUTE_DELAY_MS = 500; // Delay before executing command to show status
const STATUS_MESSAGE_DURATION_MS = 2000; // Duration to show status messages

const App: React.FC<AppProps> = ({ codexArgs = [], currentDirOnly = false, hideOptions = [] }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectIndex, setSelectedProjectIndex] = useState(0);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'projects' | 'sessions'>('projects');
  const [dimensions, setDimensions] = useState({ width: DEFAULT_TERMINAL_WIDTH, height: DEFAULT_TERMINAL_HEIGHT });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [showCommandEditor, setShowCommandEditor] = useState(false);
  const [editedArgs, setEditedArgs] = useState<string[]>(codexArgs);
  const [showFullView, setShowFullView] = useState(false);
  const [projectSearchActive, setProjectSearchActive] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [projectSearchIndex, setProjectSearchIndex] = useState(0);
  const [sessionSearchActive, setSessionSearchActive] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');
  const [sessionSearchIndex, setSessionSearchIndex] = useState(0);
  const [sessionSearchLoading, setSessionSearchLoading] = useState(false);
  const [sessionSearchError, setSessionSearchError] = useState<string | null>(null);
  const [conversationCache, setConversationCache] = useState<Record<string, Conversation[]>>({});
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [paginating, setPaginating] = useState(false);
  const [prevPage, setPrevPage] = useState(0);

  useEffect(() => {
    // Load config on mount
    const loadedConfig = loadConfig();
    setConfig(loadedConfig);
  }, []);

  const loadProjects = async () => {
    try {
      setProjectLoading(true);
      setProjectError(null);
      const { projects: fetchedProjects } = await getProjects();
      const filtered = currentDirOnly
        ? fetchedProjects.filter((project) => project.workspacePath === process.cwd())
        : fetchedProjects;

      setProjects(filtered);

      if (filtered.length === 0) {
        setSelectedProject(null);
        setSelectedProjectIndex(0);
        if (viewMode !== 'projects') {
          setViewMode('projects');
          setConversations([]);
          setTotalCount(0);
          setCurrentPage(0);
          setPrevPage(0);
          setSelectedIndex(0);
          setShowFullView(false);
        }
        return;
      }

      if (selectedProject) {
        const existingIndex = filtered.findIndex((project) => project.id === selectedProject.id);
        if (existingIndex !== -1) {
          setSelectedProject(filtered[existingIndex]);
          setSelectedProjectIndex(existingIndex);
          return;
        }
      }

      const fallbackIndex = Math.min(selectedProjectIndex, filtered.length - 1);
      setSelectedProjectIndex(fallbackIndex);
      setSelectedProject(filtered[fallbackIndex]);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'プロジェクトの読み込みに失敗しました');
    } finally {
      setProjectLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [currentDirOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Update dimensions on terminal resize
    const updateDimensions = () => {
      setDimensions({
        width: stdout.columns || DEFAULT_TERMINAL_WIDTH,
        height: stdout.rows || DEFAULT_TERMINAL_HEIGHT
      });
    };
    
    updateDimensions();
    if (stdout) {
      stdout.on('resize', updateDimensions);
      return () => {
        stdout.off('resize', updateDimensions);
      };
    }
    return undefined;
  }, [stdout]);

  const filteredProjects = useMemo(() => {
    const query = projectSearchQuery.trim().toLowerCase();
    if (!query) {
      return projects;
    }

    return projects.filter((project) => {
      const name = project.meta.workspaceName?.toLowerCase() ?? '';
      const path = project.workspacePath.toLowerCase();
      return name.includes(query) || path.includes(query);
    });
  }, [projects, projectSearchQuery]);

  const visibleProjects = projectSearchActive ? filteredProjects : projects;

  const safeProjectIndex = useMemo(() => {
    const length = visibleProjects.length;
    if (length === 0) {
      return 0;
    }
    const candidate = projectSearchActive ? projectSearchIndex : selectedProjectIndex;
    return Math.max(0, Math.min(candidate, length - 1));
  }, [projectSearchActive, projectSearchIndex, selectedProjectIndex, visibleProjects.length]);

  const currentProjectForPreview = visibleProjects[safeProjectIndex] ?? null;

  useEffect(() => {
    if (!projectSearchActive) {
      return;
    }
    const length = filteredProjects.length;
    if (length === 0) {
      if (projectSearchIndex !== 0) {
        setProjectSearchIndex(0);
      }
      return;
    }
    if (projectSearchIndex >= length) {
      setProjectSearchIndex(length - 1);
    }
  }, [projectSearchActive, filteredProjects, projectSearchIndex]);

  useEffect(() => {
    if (!projectSearchActive) {
      return;
    }
    const baseProject = projects[selectedProjectIndex];
    if (!baseProject) {
      return;
    }
    const idx = filteredProjects.findIndex((project) => project.id === baseProject.id);
    if (idx !== -1 && idx !== projectSearchIndex) {
      setProjectSearchIndex(idx);
    }
  }, [projectSearchActive, filteredProjects, projects, projectSearchIndex, selectedProjectIndex]);

  const selectedWorkspacePath = selectedProject?.workspacePath ?? null;

  const sessionSearchResults = useMemo(() => {
    if (!selectedWorkspacePath) {
      return [] as Conversation[];
    }

    const base = conversationCache[selectedWorkspacePath] ?? [];
    const query = sessionSearchQuery.trim().toLowerCase();

    if (!query) {
      return base;
    }

    return base.filter((conversation) => {
      const haystack = [
        conversation.sessionId,
        conversation.sessionUuid ?? '',
        conversation.projectPath,
        conversation.firstMessage,
        conversation.lastMessage,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [conversationCache, selectedWorkspacePath, sessionSearchQuery]);

  const activeConversations = sessionSearchActive ? sessionSearchResults : conversations;

  const safeSessionIndex = useMemo(() => {
    const length = activeConversations.length;
    if (length === 0) {
      return 0;
    }
    const candidate = sessionSearchActive ? sessionSearchIndex : selectedIndex;
    return Math.max(0, Math.min(candidate, length - 1));
  }, [activeConversations.length, selectedIndex, sessionSearchActive, sessionSearchIndex]);

  const selectedConversationForPreview = activeConversations[safeSessionIndex] ?? null;

  useEffect(() => {
    if (!sessionSearchActive) {
      return;
    }
    const length = sessionSearchResults.length;
    if (length === 0) {
      if (sessionSearchIndex !== 0) {
        setSessionSearchIndex(0);
      }
      return;
    }
    if (sessionSearchIndex >= length) {
      setSessionSearchIndex(length - 1);
    }
  }, [sessionSearchActive, sessionSearchIndex, sessionSearchResults]);

  useEffect(() => {
    if (!sessionSearchActive || !selectedWorkspacePath) {
      return;
    }
    const base = conversationCache[selectedWorkspacePath] ?? [];
    if (base.length === 0) {
      return;
    }
    const current = conversations[selectedIndex];
    if (!current) {
      return;
    }
    const idx = base.findIndex((conversation) => conversation.sessionId === current.sessionId);
    if (idx !== -1 && idx !== sessionSearchIndex) {
      setSessionSearchIndex(idx);
    }
  }, [conversationCache, conversations, selectedIndex, selectedWorkspacePath, sessionSearchActive, sessionSearchIndex]);

  const buildCommandArgs = (
    conversation: Conversation,
    args: string[],
    actionType: 'resume' | 'start'
  ) => {
    if (actionType === 'resume') {
      const sessionIdentifier = conversation.sessionUuid ?? conversation.sessionId;
      return [...args, 'resume', sessionIdentifier];
    }
    if (args.length === 0) {
      return ['chat'];
    }
    return [...args];
  };

  const loadAllConversationsForProject = async (project: Project) => {
    const cacheKey = project.workspacePath;
    if (conversationCache[cacheKey]) {
      return conversationCache[cacheKey];
    }

    setSessionSearchLoading(true);
    setSessionSearchError(null);
    try {
      const all = await getAllConversations(project.workspacePath);
      setConversationCache((prev) => ({
        ...prev,
        [cacheKey]: all,
      }));
      return all;
    } catch (error) {
      setSessionSearchError(error instanceof Error ? error.message : 'Codexセッションの検索用データ取得に失敗しました');
      return [] as Conversation[];
    } finally {
      setSessionSearchLoading(false);
    }
  };

  const executeCodexCommand = (
    conversation: Conversation,
    args: string[],
    statusMsg: string,
    actionType: 'resume' | 'start'
  ) => {
    const commandArgs = buildCommandArgs(conversation, args, actionType);
    const commandStr = `codex ${commandArgs.join(' ')}`;
    setStatusMessage(statusMsg);
    
    setTimeout(() => {
      exit();
      
      // Output helpful information
      if (actionType === 'resume') {
        console.log(`\nResuming conversation: ${conversation.sessionId}`);
      } else {
        console.log(`\nStarting new session in: ${conversation.projectPath}`);
      }
      console.log(`Directory: ${conversation.projectPath}`);
      console.log(`Executing: ${commandStr}`);
      console.log('---');
      
      // Windows-specific reminder
      if (process.platform === 'win32') {
        console.log('💡 ヒント: 入力できない場合は ENTER を押して Codex CLI をアクティブにしてください。');
        console.log('');
      }
      
      // Spawn codex process
      const codex = spawn('codex', commandArgs, {
        stdio: 'inherit',
        cwd: conversation.projectPath,
        shell: process.platform === 'win32'
      });
      
      codex.on('error', (err) => {
        console.error(`\nFailed to ${actionType} ${actionType === 'resume' ? 'conversation' : 'new session'}:`, err.message);
        console.error('Make sure the codex CLI is installed and available in PATH');
        console.error(`Or the project directory might not exist: ${conversation.projectPath}`);
        
        // For resume action, provide clipboard fallback
        if (actionType === 'resume') {
          try {
            clipboardy.writeSync(conversation.sessionId);
            console.log(`\nSession ID copied to clipboard: ${conversation.sessionId}`);
            console.log(`Project directory: ${conversation.projectPath}`);
            console.log(`You can manually run:`);
            console.log(`  cd "${conversation.projectPath}"`);
            const argsStr = args.length > 0 ? `${args.join(' ')} ` : '';
            console.log(`  codex ${argsStr}resume ${conversation.sessionId}`);
            if (!conversation.sessionUuid) {
              console.log('  (Session UUID not found; resume may require selecting the JSONL file manually.)');
              console.log(`  JSONL file: ${conversation.sessionPath ?? '(unknown)'}`);
            }
          } catch (clipErr) {
            console.error('Failed to copy to clipboard:', clipErr instanceof Error ? clipErr.message : String(clipErr));
          }
        }
        
        process.exit(1);
      });
      
      codex.on('close', (code) => {
        process.exit(code || 0);
      });
    }, EXECUTE_DELAY_MS);
  };

  const loadConversations = async (isPaginating = false) => {
    if (sessionSearchActive) {
      return;
    }
    if (!selectedProject) {
      setConversations([]);
      setTotalCount(0);
      setSessionError(null);
      setSessionsLoading(false);
      setPaginating(false);
      return;
    }

    try {
      if (isPaginating) {
        setPaginating(true);
      } else {
        setSessionsLoading(true);
      }

      const offset = currentPage * ITEMS_PER_PAGE;
      const { conversations: convs, total } = await getPaginatedConversations({
        limit: ITEMS_PER_PAGE,
        offset,
        currentDirFilter: selectedProject.workspacePath
      });
      setConversations(convs);
      setTotalCount(total);
      setSessionError(null);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      if (isPaginating) {
        setPaginating(false);
      } else {
        setSessionsLoading(false);
      }
    }
  };

  const handleProjectConfirm = () => {
    const project = visibleProjects[safeProjectIndex];
    if (!project) {
      return;
    }
    const baseIndex = projects.findIndex((candidate) => candidate.id === project.id);
    if (baseIndex !== -1) {
      setSelectedProjectIndex(baseIndex);
    }
    setSelectedProject(project);
    setProjectSearchActive(false);
    setViewMode('sessions');
    setCurrentPage(0);
    setPrevPage(0);
    setSelectedIndex(0);
    setSessionSearchActive(false);
    setSessionSearchQuery('');
    setSessionSearchIndex(0);
    setSessionSearchError(null);
    setShowFullView(false);
    setStatusMessage(null);
    setSessionError(null);
  };

  const returnToProjectsView = () => {
    if (viewMode === 'projects') {
      return;
    }
    setViewMode('projects');
    setConversations([]);
    setTotalCount(0);
    setCurrentPage(0);
    setPrevPage(0);
    setSelectedIndex(0);
    setSessionSearchActive(false);
    setSessionSearchQuery('');
    setSessionSearchIndex(0);
    setSessionSearchError(null);
    setShowFullView(false);
    setStatusMessage(null);
    setSessionError(null);
  };

  useEffect(() => {
    if (viewMode === 'sessions' && selectedProject) {
      loadConversations();
    }
  }, [viewMode, selectedProject]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (viewMode !== 'sessions' || !selectedProject) {
      return;
    }
    const isPaginating = currentPage !== prevPage;
    setPrevPage(currentPage);
    if (isPaginating) {
      loadConversations(true);
    }
  }, [currentPage, viewMode, selectedProject]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionSearchActive && viewMode === 'sessions' && selectedProject) {
      loadConversations();
    }
  }, [sessionSearchActive, viewMode, selectedProject]); // eslint-disable-line react-hooks/exhaustive-deps

  useInput((input, key) => {
    if (showCommandEditor) return;

    const handleSearchInput = (scope: 'projects' | 'sessions'): boolean => {
      const isClearShortcut = Boolean(config && matchesKeyBinding(input, key, config.keybindings.searchClear));

      if (isClearShortcut) {
        if (scope === 'projects') {
          if (projectSearchQuery.length > 0) {
            setProjectSearchQuery('');
            setProjectSearchIndex(0);
          }
        } else {
          if (sessionSearchQuery.length > 0) {
            setSessionSearchQuery('');
            setSessionSearchIndex(0);
          }
        }
        return true;
      }

      if (key.escape) {
        if (scope === 'projects') {
          setProjectSearchActive(false);
        } else {
          setSessionSearchActive(false);
          setSessionSearchQuery('');
          setSessionSearchIndex(0);
          setSessionSearchError(null);
          setSessionSearchLoading(false);
          setSelectedIndex(0);
        }
        return true;
      }

      if (key.return || key.tab || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.pageUp || key.pageDown) {
        return false;
      }

      if (key.backspace || key.delete) {
        if (scope === 'projects') {
          if (projectSearchQuery.length > 0) {
            setProjectSearchQuery((prev) => prev.slice(0, -1));
            setProjectSearchIndex(0);
          }
        } else {
          if (sessionSearchQuery.length > 0) {
            setSessionSearchQuery((prev) => prev.slice(0, -1));
            setSessionSearchIndex(0);
          }
        }
        return true;
      }

      if (key.ctrl || key.meta) {
        return false;
      }

      if (!input) {
        return false;
      }

      if (scope === 'projects') {
        setProjectSearchQuery((prev) => prev + input);
        setProjectSearchIndex(0);
      } else {
        setSessionSearchQuery((prev) => prev + input);
        setSessionSearchIndex(0);
      }
      return true;
    };

    if (viewMode === 'projects' && projectSearchActive) {
      if (handleSearchInput('projects')) {
        return;
      }
    }

    if (viewMode === 'sessions' && sessionSearchActive) {
      if (handleSearchInput('sessions')) {
        return;
      }
    }

    if (!config) return;

    if (matchesKeyBinding(input, key, config.keybindings.searchToggle)) {
      if (viewMode === 'projects') {
        setProjectSearchActive((prev) => !prev);
        if (!projectSearchActive) {
          const current = projects[selectedProjectIndex];
          if (current) {
            const idx = filteredProjects.findIndex((project) => project.id === current.id);
            if (idx !== -1) {
              setProjectSearchIndex(idx);
            }
          }
        }
      } else if (viewMode === 'sessions') {
        if (!selectedProject) {
          return;
        }

        if (sessionSearchActive) {
          setSessionSearchActive(false);
          setSessionSearchQuery('');
          setSessionSearchIndex(0);
          setSessionSearchError(null);
          setSessionSearchLoading(false);
          setSelectedIndex(0);
        } else {
          setSessionSearchActive(true);
          setSessionSearchError(null);
          void loadAllConversationsForProject(selectedProject);
        }
      }
      return;
    }

    if (matchesKeyBinding(input, key, config.keybindings.searchClear)) {
      if (viewMode === 'projects' && projectSearchActive) {
        setProjectSearchQuery('');
        setProjectSearchIndex(0);
        return;
      }
      if (viewMode === 'sessions' && sessionSearchActive) {
        setSessionSearchQuery('');
        setSessionSearchIndex(0);
        return;
      }
    }

    if (matchesKeyBinding(input, key, config.keybindings.quit)) {
      exit();
      return;
    }

    if (viewMode === 'sessions' && !sessionSearchActive && (key.escape || key.backspace)) {
      returnToProjectsView();
      return;
    }

    if (viewMode === 'projects') {
      if (projectLoading || visibleProjects.length === 0) {
        return;
      }

      const updateProjectCursor = (nextIndex: number) => {
        if (visibleProjects.length === 0) {
          return;
        }
        const clamped = Math.max(0, Math.min(nextIndex, visibleProjects.length - 1));
        if (projectSearchActive) {
          setProjectSearchIndex(clamped);
          const project = visibleProjects[clamped];
          if (project) {
            const baseIdx = projects.findIndex((candidate) => candidate.id === project.id);
            if (baseIdx !== -1) {
              setSelectedProjectIndex(baseIdx);
            }
          }
        } else {
          setSelectedProjectIndex(clamped);
        }
      };

      if (matchesKeyBinding(input, key, config.keybindings.selectPrevious)) {
        updateProjectCursor(safeProjectIndex - 1);
        return;
      }

      if (matchesKeyBinding(input, key, config.keybindings.selectNext)) {
        updateProjectCursor(safeProjectIndex + 1);
        return;
      }

      if (matchesKeyBinding(input, key, config.keybindings.pagePrevious)) {
        updateProjectCursor(safeProjectIndex - MAX_VISIBLE_CONVERSATIONS);
        return;
      }

      if (matchesKeyBinding(input, key, config.keybindings.pageNext)) {
        updateProjectCursor(safeProjectIndex + MAX_VISIBLE_CONVERSATIONS);
        return;
      }

      if (matchesKeyBinding(input, key, config.keybindings.confirm)) {
        handleProjectConfirm();
        return;
      }

      if (matchesKeyBinding(input, key, config.keybindings.openCommandEditor)) {
        setShowCommandEditor(true);
        return;
      }

      return;
    }

    if (matchesKeyBinding(input, key, config.keybindings.toggleFullView)) {
      setShowFullView((prev) => !prev);
      setStatusMessage(showFullView ? 'Switched to normal view' : 'Switched to full view');
      setTimeout(() => setStatusMessage(null), STATUS_MESSAGE_DURATION_MS);
      return;
    }

    if (showFullView) {
      return;
    }

    const activeList = activeConversations;
    if (!sessionSearchActive && sessionsLoading) {
      return;
    }
    if (sessionSearchActive && sessionSearchLoading && activeList.length === 0) {
      return;
    }
    if (activeList.length === 0) {
      return;
    }

    const updateSessionCursor = (nextIndex: number) => {
      if (activeList.length === 0) {
        return;
      }
      const clamped = Math.max(0, Math.min(nextIndex, activeList.length - 1));
      if (sessionSearchActive) {
        setSessionSearchIndex(clamped);
      } else {
        setSelectedIndex(clamped);
      }
    };

    if (matchesKeyBinding(input, key, config.keybindings.selectPrevious)) {
      if (sessionSearchActive) {
        updateSessionCursor(safeSessionIndex - 1);
        return;
      }

      if (safeSessionIndex === 0 && currentPage > 0) {
        setCurrentPage((prev) => prev - 1);
        setSelectedIndex(ITEMS_PER_PAGE - 1);
      } else {
        updateSessionCursor(safeSessionIndex - 1);
      }
      return;
    }

    if (matchesKeyBinding(input, key, config.keybindings.selectNext)) {
      const maxIndex = activeList.length - 1;
      if (sessionSearchActive) {
        updateSessionCursor(safeSessionIndex + 1);
        return;
      }

      const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
      const canGoNext = totalCount === -1 ? activeList.length === ITEMS_PER_PAGE : currentPage < totalPages - 1;
      if (safeSessionIndex === maxIndex && canGoNext) {
        setCurrentPage((prev) => prev + 1);
        setSelectedIndex(0);
      } else {
        updateSessionCursor(safeSessionIndex + 1);
      }
      return;
    }

    if (!sessionSearchActive && matchesKeyBinding(input, key, config.keybindings.pageNext)) {
      const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
      if (totalCount === -1 ? activeList.length === ITEMS_PER_PAGE : currentPage < totalPages - 1) {
        setCurrentPage((prev) => prev + 1);
        setSelectedIndex(0);
      }
      return;
    }

    if (!sessionSearchActive && matchesKeyBinding(input, key, config.keybindings.pagePrevious) && currentPage > 0) {
      setCurrentPage((prev) => prev - 1);
      setSelectedIndex(0);
      return;
    }

    if (matchesKeyBinding(input, key, config.keybindings.confirm)) {
      const selectedConv = activeList[safeSessionIndex];
      if (selectedConv) {
        const previewArgs = buildCommandArgs(selectedConv, editedArgs, 'resume');
        const commandStr = `codex ${previewArgs.join(' ')}`;
        executeCodexCommand(selectedConv, editedArgs, `Executing: ${commandStr}`, 'resume');
      }
      return;
    }

    if (matchesKeyBinding(input, key, config.keybindings.copySessionId)) {
      const selectedConv = activeList[safeSessionIndex];
      if (selectedConv) {
        try {
          clipboardy.writeSync(selectedConv.sessionId);
          setStatusMessage('✓ Session ID copied to clipboard!');
          setTimeout(() => setStatusMessage(null), STATUS_MESSAGE_DURATION_MS);
        } catch {
          setStatusMessage('✗ Failed to copy to clipboard');
          setTimeout(() => setStatusMessage(null), STATUS_MESSAGE_DURATION_MS);
        }
      }
      return;
    }

    if (matchesKeyBinding(input, key, config.keybindings.startNewSession)) {
      const selectedConv = activeList[safeSessionIndex];
      if (selectedConv) {
        const previewArgs = buildCommandArgs(selectedConv, editedArgs, 'start');
        const commandStr = `codex ${previewArgs.join(' ')}`;
        executeCodexCommand(selectedConv, editedArgs, `Executing: ${commandStr}`, 'start');
      }
      return;
    }

    if (matchesKeyBinding(input, key, config.keybindings.openCommandEditor)) {
      setShowCommandEditor(true);
    }
  });

  if (showCommandEditor) {
    return (
      <CommandEditor
        initialArgs={editedArgs}
        onComplete={(args) => {
          setEditedArgs(args);
          setShowCommandEditor(false);
        }}
        onCancel={() => setShowCommandEditor(false)}
      />
    );
  }

  const headerHeight = HEADER_HEIGHT;
  const listMaxHeight = LIST_MAX_HEIGHT;
  const bottomMargin = BOTTOM_MARGIN;
  const safetyMargin = SAFETY_MARGIN;

  if (viewMode === 'projects') {
    const projectVisibleCount = Math.min(MAX_VISIBLE_CONVERSATIONS, visibleProjects.length);
    const projectMaxVisible = projectLoading ? MAX_VISIBLE_CONVERSATIONS : Math.max(projectVisibleCount, 0);
    const needsMoreIndicator = visibleProjects.length > projectVisibleCount ? 1 : 0;
    const listHeight = Math.min(listMaxHeight, LIST_BASE_HEIGHT + projectMaxVisible + needsMoreIndicator);
    const totalUsedHeight = headerHeight + listHeight + bottomMargin + safetyMargin;
    const previewHeight = Math.max(MIN_PREVIEW_HEIGHT, dimensions.height - totalUsedHeight);
    const projectForPreview = currentProjectForPreview;
    const searchHint = projectSearchActive
      ? `検索中 (${visibleProjects.length}/${projects.length})`
      : `/${config?.keybindings.searchToggle?.[0] ?? '/'} で検索`;

    return (
      <Box flexDirection="column" width={dimensions.width} paddingX={1} paddingY={0}>
        <Box height={headerHeight} flexDirection="column">
          <Text bold color="cyan">ccresume-codex - プロジェクトブラウザ</Text>
          <Box>
            <Text dimColor>Enterでセッション一覧 / EscまたはBackspaceで戻る / qで終了</Text>
            <Text dimColor> | {searchHint}</Text>
            {projectError && <Text color="red"> | {projectError}</Text>}
          </Box>
        </Box>

        <Box height={listHeight}>
          <ProjectList
            projects={visibleProjects}
            selectedIndex={safeProjectIndex}
            maxVisible={projectLoading ? MAX_VISIBLE_CONVERSATIONS : Math.max(projectVisibleCount, 1)}
            isLoading={projectLoading}
            totalCount={projects.length}
            searchActive={projectSearchActive}
            searchQuery={projectSearchQuery}
          />
        </Box>

        <Box height={previewHeight}>
          <ProjectPreview project={projectForPreview} statusMessage={statusMessage} />
        </Box>

        <Box height={bottomMargin} />
      </Box>
    );
  }

  const selectedConversation = selectedConversationForPreview;
  const totalPages = sessionSearchActive ? 1 : Math.ceil(totalCount / ITEMS_PER_PAGE);
  const baseVisibleConversations = Math.min(MAX_VISIBLE_CONVERSATIONS, activeConversations.length);
  const listLoading = sessionSearchActive
    ? sessionSearchLoading
    : paginating || (sessionsLoading && activeConversations.length === 0);
  const conversationMaxVisible = activeConversations.length === 0 ? MAX_VISIBLE_CONVERSATIONS : baseVisibleConversations;
  const heightCount = listLoading ? conversationMaxVisible : baseVisibleConversations;
  const needsMoreIndicator = activeConversations.length > baseVisibleConversations ? 1 : 0;
  const listHeight = Math.min(listMaxHeight, LIST_BASE_HEIGHT + heightCount + needsMoreIndicator);
  const totalUsedHeight = headerHeight + listHeight + bottomMargin + safetyMargin;
  const previewHeight = Math.max(MIN_PREVIEW_HEIGHT, dimensions.height - totalUsedHeight);
  const projectLabel = selectedProject ? selectedProject.meta.workspaceName : '(unknown project)';
  const searchHint = sessionSearchActive
    ? `検索中 (${activeConversations.length}件)`
    : `/${config?.keybindings.searchToggle?.[0] ?? '/'} で検索`;

  if (showFullView) {
    return <ConversationPreviewFull conversation={selectedConversation} statusMessage={statusMessage} hideOptions={hideOptions} />;
  }

  return (
    <Box flexDirection="column" width={dimensions.width} paddingX={1} paddingY={0}>
      <Box height={headerHeight} flexDirection="column">
        <Text bold color="cyan">ccresume-codex - Codex Conversation Browser</Text>
        <Box>
          <Text dimColor>
            {sessionSearchActive
              ? `検索結果 ${activeConversations.length} 件`
              : (() => {
                  const prevKeys = config?.keybindings.pagePrevious.map(k => k === 'left' ? '←' : k).join('/') || '←';
                  const nextKeys = config?.keybindings.pageNext.map(k => k === 'right' ? '→' : k).join('/') || '→';
                  const pageHelp = `Press ${prevKeys}/${nextKeys} for pages`;
                  return totalCount === -1
                    ? <>Page {currentPage + 1} | {pageHelp}</>
                    : <>{totalCount} total | Page {currentPage + 1}/{totalPages || 1} | {pageHelp}</>;
                })()}
          </Text>
          <Text dimColor> | Project: {projectLabel}</Text>
          <Text dimColor> | Esc/Backspaceでプロジェクト一覧に戻る</Text>
          <Text dimColor> | {searchHint}</Text>
          {editedArgs.length > 0 && (
            <Text color="yellow"> | Options: {editedArgs.join(' ')}</Text>
          )}
          {sessionError && (
            <Text color="red"> | {sessionError}</Text>
          )}
          {sessionSearchError && (
            <Text color="red"> | {sessionSearchError}</Text>
          )}
        </Box>
      </Box>

      <Box height={listHeight}>
        <ConversationList
          conversations={activeConversations}
          selectedIndex={safeSessionIndex}
          maxVisible={conversationMaxVisible}
          isLoading={listLoading}
          searchActive={sessionSearchActive}
          searchQuery={sessionSearchQuery}
        />
      </Box>

      <Box height={previewHeight}>
        <ConversationPreview conversation={selectedConversation} statusMessage={statusMessage} hideOptions={hideOptions} />
      </Box>

      <Box height={bottomMargin} />
    </Box>
  );
};

export default App;
