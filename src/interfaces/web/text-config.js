// spec: BDK-S-004
// Chữ của phần cấu hình, phân quyền, duyệt và sổ thao tác (giao diện tiếng Anh; xem text.js).
import { plural } from './text.js';

export const C = {
  nav: [['environments', 'Environments'], ['matrix', 'Branch matrix'], ['rules', 'Branch rules'], ['access', 'Access'], ['history', 'History, import, export'], ['danger', 'Danger zone']],
  approvals: 'Approvals', unsaved: 'Unsaved changes', reading: 'Reading the configuration…', readOnly: 'Your role can view the configuration but not change it.',
  save: {
    dirty: (v) => `Unsaved changes on top of version ${v}`, note: 'Note for the history', noteHint: 'what changed and why', preview: 'Preview changes', discard: 'Discard', save: 'Save as new version',
    saving: 'Saving…', changes: (n) => plural(n, 'change'), none: 'Nothing differs from the saved version.', invalid: 'The draft is not valid:', from: 'from', to: 'to',
  },
  env: {
    lead: 'An environment is a machine that runs the stack. Colour, order and protection are set here; machines are added and removed at the bottom of this page (or by a target file in targets/<name>.json on the machine running the console).',
    color: 'Colour', description: 'Description', up: 'Move up', down: 'Move down', kind: { local: 'this machine', remote: 'remote machine', memory: 'in memory' },
    protection: 'Protection', approval: 'A second person must approve', typeName: 'Type the service name to confirm', restrict: 'Only listed users may deploy', freeze: 'Freeze window (weekly)',
    allowed: 'Allowed users (comma separated)', from: 'From', to: 'To', momentHint: 'Fri 16:00', badge: { approval: 'approval', typeName: 'typed confirmation', restrict: 'listed users only', freeze: (f, t) => `frozen ${f} → ${t}` },
  },
  matrix: {
    lead: 'Which branch feeds which environment, per service. A cell marked "override" applies to one service only; the others inherit their project default (set under Branch rules).',
    notice: 'Declaring a branch here does not deploy anything by itself: the platform only builds a commit that is declared, and a person or agent starts each deploy (S-029).',
    service: 'Service', warnings: 'Warnings', mode: { manual: 'Manual', auto: 'Auto on push', pattern: 'Branch pattern', none: 'Not set' }, modeOf: (s, e) => `Mode of ${s} on ${e}`, branchOf: (s, e) => `Branch of ${s} on ${e}`,
    override: 'override', reset: 'reset', inherited: 'inherits project default', missing: (list) => `Not set: ${list.join(', ')}`, shared: (b, list) => `Branch ${b} feeds ${list.join(' and ')}`,
  },
  rules: {
    defaults: 'Project defaults', defaultsLead: 'Used by every service of the project unless the service has an override.', project: 'Project',
    general: 'General branch rules', order: 'Rules higher in the list win', pattern: 'Branch pattern', target: 'Goes to environment', noTarget: 'No environment', remove: 'Remove', add: 'Add rule',
    tester: 'Try a branch name', branch: 'Branch name', service: 'For service (optional)', anyService: 'Any service', run: 'Test',
    hit: (n) => `${plural(n, 'rule')} match`, miss: 'No rule matches', envs: (list) => (list.length ? `Feeds: ${list.join(', ')}` : 'Feeds no environment of this service'), matched: 'match',
  },
  access: {
    lead: 'What each role may do on each environment. The built-in admin is not in this table: it may do everything. The Agent row applies to callers using the agent token.',
    role: 'Role', level: ['View only', 'Deploy', 'Deploy and rollback'], levelOf: (r, e) => `Level of ${r} on ${e}`,
    users: 'Users', usersLead: 'Each user signs in through the browser prompt with their own name and password.', name: 'User name', add: 'Add user', none: 'No users yet. Only admin and the agent token can sign in.',
    newPassword: (n) => `Password of ${n} (shown once; the console only keeps a hash):`, dismiss: 'I copied it', resetPassword: 'New password', remove: 'Remove', adminOnly: 'Only Admin and DevOps can manage users.',
  },
  history: {
    title: 'Configuration history', current: 'current', restore: 'Restore', noNote: 'no note', empty: 'No version saved yet: the defaults are in effect.',
    exportTitle: 'Export', importTitle: 'Import', importHint: 'Paste exported JSON here…', apply: 'Apply to draft', applyHint: 'The draft still has to be previewed and saved.', badJson: (m) => `Not valid JSON: ${m}`,
    audit: 'Audit log', auditLead: 'Who did what on this console. Entries are only ever added.', auditEmpty: 'No entry matches.',
    filter: { actor: 'Actor', action: 'Action', anyAction: 'Any action', outcome: 'Outcome', anyOutcome: 'Any outcome', refused: 'Refused only', ok: 'Accepted only', q: 'Search target or detail',
      actions: [['deploy', 'Deploy'], ['rollback', 'Rollback'], ['approval', 'Approval'], ['config', 'Configuration'], ['user', 'Users'], ['environment', 'Environments']] }, dropped: (n) => `${plural(n, 'entry')} could not be written since the console started.`,
  },
  danger: {
    reset: 'Reset the configuration to defaults', resetText: 'Removes every protection, permission limit and branch mapping. It is saved as a new version, so it can be restored from the history.',
    type: (w) => `Type ${w} to confirm`, word: 'reset', resetButton: 'Reset configuration',
    creds: 'Regenerate the admin password and the agent token', credsText: 'This is done on the machine running the console, not from the browser:', credsCommand: 'node infra/bsn.js console --reset-auth',
    auto: 'Automatic deploy on push', autoText: 'Off. The platform rule is "declare the commit first, build after" (S-029), so nothing is deployed without a person or an agent asking for it.',
  },
  machines: {
    add: 'Add an environment', modeCreate: 'Create a new machine', modeRegister: 'Register an existing machine',
    createLead: 'The console creates a virtual machine in the cloud project of this installation and prepares it to receive commands (Docker, Node, the control commands). Nothing is deployed: an operator deploys services to it afterwards.',
    registerLead: 'Use a machine that already exists and was prepared with server/setup.sh. Nothing is created and nothing is charged.',
    name: 'Environment name', machineType: 'Machine size', instance: 'Machine name in the cloud', zone: 'Zone', typeLabel: (m) => `${m.id} · ${m.memoryGb} GB`,
    cost: (usd) => `Estimated cost: about ${usd.toFixed(2)} USD per day while the machine exists.`, costNote: 'An estimate for the machine and its 20 GB disk, not a quote. Delete the machine here when it is no longer needed.',
    typeName: 'Type the environment name to confirm', createGo: 'Create machine', registerGo: 'Register machine',
    listTitle: 'Added from the console', listLead: 'Removing from the console keeps the machine; deleting removes the machine and its disk.',
    state: { ready: 'ready', creating: 'creating', deleting: 'deleting', failed: 'failed' }, managed: 'created by the console', registered: 'registered',
    meta: (instance, zone, type, by, when) => `${instance} · ${zone}${type ? ` · ${type}` : ''} · added by ${by || 'unknown'} ${when}`,
    typeToRemove: (name) => `Type ${name}`, removeKeep: 'Remove from console', removeDelete: 'Delete machine',
    operation: (kind, name) => `${kind === 'delete' ? 'Deleting' : 'Creating'} ${name}`, opStatus: { running: 'running', succeeded: 'done', failed: 'failed' },
    step: { machine: 'Create machine', ssh: 'Wait for SSH', setup: 'Install tools', verify: 'Verify', delete: 'Delete machine' },
  },
  approval: {
    title: 'Approvals', lead: 'Requests on environments that need a second person. The person who asked cannot approve their own request. Pending requests expire after 24 hours and are forgotten when the console restarts.',
    empty: 'No request yet.', by: (who, when) => `asked by ${who} · ${when}`, decided: (who) => `by ${who}`, approve: 'Approve and run', reject: 'Reject', openRun: 'Open run',
    status: { pending: 'pending', approved: 'approved', rejected: 'rejected', expired: 'expired' },
    need: (env) => `${env} requires a second person to approve before anything runs.`, request: 'Request approval', requested: 'Approval requested',
    typeToConfirm: (w) => `Type ${w} to confirm`, typeLabel: 'Confirmation',
  },
};
