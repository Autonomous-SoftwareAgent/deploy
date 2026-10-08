// Mọi chữ hiện trên giao diện nằm ở tệp này (người dùng chốt 2026-10-08: giao diện dùng tiếng Anh toàn bộ).
// Màn hình không tự viết chữ: muốn đổi lời hay thêm ngôn ngữ thì chỉ sửa ở đây.

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const what = (n, one) => (n === 1 ? one : `${n} services`);

export const T = {
  brand: 'Deploy Console',
  title: 'Deploy Console',
  loading: 'Opening the console…',
  dash: '—',
  ago: { now: 'just now', min: (n) => `${n} min ago`, hour: (n) => `${n} h ago`, day: (n) => `${plural(n, 'day')} ago` },
  health: { healthy: 'healthy', deploying: 'deploying', failed: 'failed', degraded: 'degraded' },
  build: { passed: 'image ready', none: 'no image', unknown: 'registry unreachable' },
  step: { fetch: 'Fetch image', start: 'Start new version', health: 'Health check', record: 'Record' },
  item: { running: 'Running', succeeded: 'Succeeded', failed: 'Failed', rolling_back: 'Restoring previous version', rolled_back: 'Previous version restored' },
  kind: { deploy: 'Deploy', rollback: 'Rollback', 'auto-revert': 'Auto-revert', up: 'Stack start' },

  nav: {
    label: 'Main navigation', overview: 'System overview', lastRun: 'Last viewed run', running: 'Running', configuration: 'Configuration',
    run: (r) => `${T.kind[r.kind] || r.kind} ${what(r.items.length, r.items[0].serviceId)} · ${r.environment.name}`,
    signedIn: (who, role) => `Signed in as ${who}${role ? ` (${role})` : ''}`, signOutHint: 'To sign out, close the browser.',
  },
  login: {
    title: 'Sign-in required', denied: 'The browser asks for a user name and password when the page opens. The user name is admin.', retry: 'Try again',
    hint: 'The password is generated the first time the console starts and is written to console.first-login.txt on this machine.',
  },

  overview: {
    title: 'System overview',
    lead: (s, p, e) => `${plural(s, 'service')} · ${plural(p, 'project')} · ${plural(e, 'environment')}. Failed, deploying and out-of-date services are listed first.`,
    reading: 'Reading the state of the environments…',
    memory: 'IN-MEMORY TEST MODE: every button here only changes sample data. No system is touched.',
    unreachable: (name, error) => `Environment ${name} is unreachable: ${error}`,
    skippedTarget: (t) => `Skipped an invalid target file: ${t}`,
    sum: { all: 'all services', failed: 'failed', deploying: 'deploying', degraded: 'degraded', behind: 'out of date' },
    degradedHint: 'No metrics source yet: the console only knows healthy or not from the health check.',
    filter: { project: 'Project', allProjects: 'All projects', environment: 'Environment', allEnvironments: 'All environments', status: 'Status', search: 'Search service or commit', searchHint: 'service name, commit message…' },
    status: [['all', 'All statuses'], ['failed', 'Failed'], ['deploying', 'Deploying'], ['healthy', 'Healthy'], ['behind', 'Out of date']],
    colService: 'Service', protected: 'protected', selectAll: 'Select every listed service', select: (name) => `Select ${name}`,
    group: { services: (n) => plural(n, 'service'), attention: (n) => `${n} need attention` },
    notDeclared: 'no declared commit',
    cell: {
      unreachable: 'unreachable', absent: 'Not in this environment', none: 'Not deployed', unknownCommit: 'commit not in the history on this machine',
      behind: (n) => `${plural(n, 'commit')} behind`, differs: 'differs from declared', declared: (sha) => `declared commit: ${sha}`,
    },
    deploy: 'Deploy…', rollback: 'Rollback…', empty: 'No service matches the filters.',
    selected: (n) => `${plural(n, 'service')} selected`, selectedHint: ' · each service keeps its own target commit at the confirmation step', clear: 'Clear',
  },

  service: {
    tabs: [['deployments', 'Deployments'], ['commits', 'Commits'], ['logs', 'Logs'], ['vars', 'Environment variables'], ['settings', 'Settings']],
    crumb: 'Overview', reading: 'Reading…', noSource: 'No data source yet. ',
    env: {
      unreachable: (error) => `This environment is unreachable: ${error}`, absent: 'This environment does not run this service.', none: 'Nothing deployed here yet.',
      unknownAuthor: 'unknown author', meta: (author, when, declared) => `${author} · deployed ${when} · declared commit: ${declared}`, notDeclared: 'none',
      charts: 'Error-rate and latency charts: no monitoring system feeds the console yet.', deploy: 'Deploy', rollback: 'Rollback',
    },
    deployments: { empty: 'The deploy ledgers of the environments hold no entry for this service yet.', unknownBy: 'unknown', ok: 'succeeded', bad: 'failed' },
    commits: {
      noRepo: 'The machine running the console has no repository of this service, so there is no commit list.',
      registry: 'The image registry is unreachable: the image column is unknown.', declared: 'declared', runningIn: (env) => `running · ${env}`,
      deploy: 'Deploy this commit', noImage: 'This commit has no image yet', rollback: 'Roll back to here',
    },
    logs: { lead: 'The last lines the running container printed on the chosen environment. This is a quick look, not a log archive: older lines and the logs of replaced versions are not kept here.', refresh: 'Refresh', loading: 'Reading…', empty: 'The container printed nothing.', none: 'This service is not running on any environment.', environment: 'Environment' },
    vars: { lead: 'Declared in the service declaration. Secrets show their name only: the values live on each target machine and the console never reads them.', name: 'Name', value: 'Value', source: 'Source', secret: 'secret · value not shown', empty: 'This service declares no environment variable.', sources: { env: 'env', secretEnv: 'secretEnv', database: 'database.urlEnv' } },
    settings: {
      declared: 'Declared commit', declaredKey: 'Commit in the declaration', none: 'none', meaningKey: 'Meaning',
      meaning: 'The commit CI is allowed to build. Each environment records the version it runs in its own deploy ledger.',
      health: 'Health check', path: 'Path', unhealthyKey: 'Unhealthy version', unhealthy: 'The previously running version is always restored; this cannot be turned off.',
      repo: 'Repository', repoKey: 'Path on the machine running the console', branch: 'Branch mapping, branch rules and service dependencies belong to the configuration phase and are not built yet.',
    },
  },

  dialog: {
    close: 'Close dialog', cancel: 'Cancel', environment: 'Target environment', targetCommit: 'Target commit', targetOf: (id) => `Target commit of ${id}`,
    heading: (kind, n, one, env) => `${T.kind[kind]} ${what(n, one)} ${kind === 'rollback' ? 'on' : 'to'} ${env}`,
    confirm: (kind, n, one, env) => `${T.kind[kind]} ${what(n, one)} ${kind === 'rollback' ? 'to the selected version on' : 'to'} ${env}`,
    leadMulti: 'Each service keeps its own target commit. Review every item before confirming.', leadOne: 'Check which version replaces which before confirming.',
    checking: 'Checking…', sending: 'Sending…', cannot: 'Cannot proceed', checkingServer: 'Checking with the server…', noResult: 'No check result yet.',
    blocked: 'blocked', warned: 'has warnings', ready: 'ready', runningOn: (env) => `Running on ${env}`, notDeployed: 'not deployed', noCommits: 'no commit to choose from',
    running: ' · running', suggestions: 'Suggestions:', removed: (n) => `${plural(n, 'commit')} will be removed`, added: (n) => `${plural(n, 'commit')} will be deployed`,
    out: 'out', in: 'in', first: 'First deploy of this service to this environment.',
    noteRollback: 'A rollback only goes back to a version that ran healthy on this same environment, and only swaps the program version: data is not rolled back.',
    noteDeploy: 'Only a commit that has an image can be deployed. If the new version is unhealthy, the previously running one is restored automatically.',
    foot: 'Auto-revert on an unhealthy version: always on. A started run cannot be cancelled.',
  },

  run: {
    crumb: 'Deploy progress', reading: 'Reading the run…', steps: 'Fetch image → start new version → health check → record', ended: (by) => `Finished · requested by ${by}`,
    noCancel: 'A started run cannot be cancelled; an unhealthy version is reverted automatically.', back: 'Back to overview',
    done: 'Completed', doneText: (n, env) => `${plural(n, 'service')} now running the new version on ${env}.`,
    failed: (n) => `${plural(n, 'service')} failed`, failedText: 'The new version was unhealthy and restoring the previous one also failed (or the command failed before changing anything). Check the log and the state of the environment.',
    reverted: (n) => `${plural(n, 'service')} restored to the previous version`, revertedText: (n) => `The new version was unhealthy, so the previously running one was restored. ${plural(n, 'other service')} succeeded.`,
    log: 'Run log', live: 'running', stopped: 'stopped', noLog: 'No log line yet.',
  },

  api: { network: (m) => `cannot reach the console server: ${m}`, status: (code) => `the server answered ${code}` },
};
