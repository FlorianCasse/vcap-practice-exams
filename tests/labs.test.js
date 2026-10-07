#!/usr/bin/env node
// Tests for the NCP-AIO lab simulator engine (NVIDIA_NCP-AIO_Labs.html, between the LAB-ENGINE markers).
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'NVIDIA_NCP-AIO_Labs.html'), 'utf8');
const src = html.slice(html.indexOf('// LAB-ENGINE-START'), html.indexOf('// LAB-ENGINE-END'));
const E = new Function(src + '\nreturn LabEngine;')();
const lab = id => E.LABS.find(l => l.id === id);

// Runs commands in a fresh session; {cmd, save} steps save the editor content that cmd opens.
function play(id, steps) {
  const s = E.create(lab(id));
  let last = null;
  for (const st of steps) {
    const cmd = typeof st === 'string' ? st : st.cmd;
    last = E.exec(s, cmd);
    assert.ok(!/simulator error/.test(last.out || ''), `${id}: "${cmd}" -> ${last.out}`);
    if (typeof st !== 'string' && st.save !== undefined) {
      assert.ok(last.editor, `${id}: "${cmd}" should open the editor`);
      last = { out: E.save(s, last.editor, st.save) };
    }
  }
  return { s, last };
}
const out = (id, steps) => play(id, steps).last.out || '';

let failed = 0, passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}

// Reference solutions pass every objective; an untouched lab passes none.
for (const l of E.LABS) {
  test(`${l.id}: reference solution scores ${l.objectives.length}/${l.objectives.length}`, () => {
    const res = E.evaluate(play(l.id, l.solution).s);
    assert.deepStrictEqual(res.filter(r => !r.ok).map(r => r.text), []);
  });
  test(`${l.id}: untouched lab scores 0`, () => {
    const res = E.evaluate(E.create(l));
    assert.deepStrictEqual(res.filter(r => r.ok).map(r => r.text), []);
  });
}

// BCM / cmsh
test('cmsh: power on refuses an uncommitted node', () => {
  assert.match(out('bcm-add-node', ['cmsh', 'device', 'clone node008 node009', 'power on -n node009']), /commit first/);
});
test('cmsh: clone prints the switch-settings warning and enters the new object', () => {
  const { s, last } = play('bcm-add-node', ['cmsh', 'device', 'clone node008 node009']);
  assert.match(last.out, /Ethernet switch settings were not cloned/);
  assert.strictEqual(E.prompt(s), '[bcm-head->device*[node009*]]% ');
});
test('cmsh: wrong BMC IP makes power on time out', () => {
  assert.match(out('bcm-add-node', ['cmsh', 'device', 'clone node008 node009', 'commit', 'power on']), /FAILED.*10\.148\.0\.9/);
});
test('cmsh: wrong MAC leaves the node DOWN and shows it in newnodes', () => {
  const steps = ['cmsh', 'device', 'clone node008 node009', 'set mac 5C:25:73:BB:20:99', 'interfaces', 'use ipmi0', 'set ip 10.148.0.20', 'exit', 'exit', 'commit', 'power on', 'status', 'status', 'status', 'newnodes'];
  const { s, last } = play('bcm-add-node', steps);
  assert.match(last.out, /5C:25:73:BB:20:09/);
  assert.strictEqual(s.st.bcm.device.node009.status, 'DOWN');
});
test('cmsh: device-level get/set ip maps to BOOTIF', () => {
  const { s, last } = play('bcm-add-node', ['cmsh', 'device', 'use node001', 'set ip 10.141.0.50', 'get ip']);
  assert.strictEqual(last.out, '10.141.0.50');
  assert.strictEqual(s.drafts['device:node001'].ifs.bootif.ip, '10.141.0.50');
});
test('cmsh: get unknown property and help', () => {
  assert.match(out('bcm-add-node', ['cmsh', 'device', 'use node001', 'get foo']), /unknown property/);
  assert.match(out('bcm-add-node', ['cmsh', 'help']), /imageupdate/);
});
test('cmsh: quit discards uncommitted changes with a warning', () => {
  const { s, last } = play('bcm-add-node', ['cmsh', 'device', 'clone node008 node009', 'quit']);
  assert.match(last.out, /discarded: node009/);
  assert.ok(!s.st.bcm.device.node009);
});
test('cmsh: category refuses an uncommitted software image', () => {
  assert.match(out('bcm-image', ['cmsh', 'softwareimage', 'clone dgx-h100-image x1', 'category', 'use dgx-h100', 'set softwareimage x1']), /not committed yet/);
});
test('cmsh: imageupdate without -w is a dry run', () => {
  const { s, last } = play('bcm-image', ['cmsh', 'device', 'imageupdate -n node001']);
  assert.match(last.out, /dry run = yes, no data changes/);
  assert.ok(!s.st.bcm.device.node001.packages.includes('datacenter-gpu-manager-4-cuda12'));
});
test('apt: install without -y asks for confirmation; installing on the head node does not touch images', () => {
  const { s, last } = play('bcm-image', ['apt install datacenter-gpu-manager-4-cuda12', 'n']);
  assert.strictEqual(last.out, 'Abort.');
  play('bcm-image', ['apt install -y datacenter-gpu-manager-4-cuda12']);
  assert.ok(!s.st.bcm.softwareimage['dgx-h100-image'].packages.includes('datacenter-gpu-manager-4-cuda12'));
});
test('ssh: unknown host and a node that is not UP', () => {
  assert.match(out('bcm-add-node', ['ssh node042']), /Could not resolve hostname/);
  assert.match(out('bcm-add-node', ['cmsh', 'device', 'clone node008 node009', 'commit', 'quit', 'ssh node009']), /No route to host/);
});

// Slurm / systemd
test('slurm: state=idle resumes a DOWN node, resume on an idle node is rejected', () => {
  const { s } = play('slurm-drain', ['scontrol update nodename=node004 state=idle']);
  assert.strictEqual(s.st.slurm.nodes.node004.state, 'idle');
  assert.match(out('slurm-pending', ['scontrol update nodename=node004 state=resume']), /Invalid node state specified/);
});
test('slurm: resuming a node whose munge is down sends it back to down*', () => {
  const { s, last } = play('slurm-drain', ['scontrol update nodename=node004 state=resume', 'sinfo', 'sinfo']);
  assert.match(last.out, /down\* node004/);
  assert.strictEqual(s.st.slurm.nodes.node004.reason, 'Not responding');
});
test('slurm: drain without a reason is refused', () => {
  assert.match(out('slurm-pending', ['scontrol update nodename=node004 state=drain']), /must specify a reason/);
});
test('slurm: scancel cancels a job and frees its nodes; sbatch/srun are disabled', () => {
  const { s } = play('slurm-pending', ['scancel 2201']);
  assert.strictEqual(s.st.slurm.jobs.find(j => j.id === 2201).st, 'CA');
  assert.strictEqual(s.st.slurm.nodes.node001.job, null);
  assert.match(out('slurm-pending', ['scancel 9999']), /Invalid job id/);
  assert.match(out('slurm-pending', ['sbatch job.sh']), /disabled/);
});
test('slurm: QOS the user is not entitled to is rejected; running job QOS cannot change', () => {
  assert.match(out('slurm-pending', ['scontrol update jobid=2211 qos=premium']), /Invalid qos specification/);
  assert.match(out('slurm-pending', ['scontrol update jobid=2201 qos=normal']), /no longer pending/);
});
test('sacctmgr: modify asks for confirmation and N discards', () => {
  const { s, last } = play('slurm-pending', ['sacctmgr modify qos normal set MaxTRESPerUser=gres/gpu=16', 'n']);
  assert.strictEqual(last.out, ' Changes Discarded');
  assert.strictEqual(s.st.slurm.qos.normal.maxGpuPU, 8);
  const r = play('slurm-pending', ['sacctmgr -i modify qos normal set MaxTRESPerUser=gres/gpu=16']);
  assert.strictEqual(r.s.st.slurm.qos.normal.maxGpuPU, 16);
});
test('systemd: slurmd stays active but cannot register while munge is down', () => {
  const { s } = play('slurm-drain', ['ssh node004', 'systemctl restart slurmd', 'exit', 'sinfo']);
  assert.ok(s.st.hosts.node004.services.slurmd.active);
  assert.ok(s.st.slurm.nodes.node004.nores);
  assert.match(out('slurm-drain', ['ssh node004', 'journalctl -u slurmd -n 2']), /Munge encode failed/);
});
test('cmsh services submode status lists services, not the device', () => {
  assert.match(out('slurm-drain', ['cmsh', 'device', 'use node004', 'services', 'status']), /munge .*STOPPED/);
});

// Kubernetes
test('k8s: GPU request without limit is rejected by the API', () => {
  assert.match(out('k8s-gpu-pod', ['kubectl create ns ml-team', 'kubectl apply -f gpu-test.yaml']), /Limit must be set for non overcommitable resources/);
});
test('k8s: missing namespace error', () => {
  assert.match(out('k8s-gpu-pod', ['kubectl apply -f gpu-test.yaml']), /namespaces "ml-team" not found/);
});
test('k8s: FailedScheduling message lists reasons in scheduler order', () => {
  const fixed = lab('k8s-gpu-pod').solution.find(x => typeof x !== 'string');
  const o = out('k8s-gpu-pod', ['kubectl create ns ml-team', fixed, 'kubectl apply -f gpu-test.yaml', 'kubectl describe pod gpu-test -n ml-team']);
  assert.match(o, /0\/4 nodes are available: 1 node\(s\) had untolerated taint \{node-role.kubernetes.io\/control-plane: \}, 1 node\(s\) were unschedulable, 2 Insufficient nvidia.com\/gpu\./);
});
test('k8s: pod without a GPU lands on the CPU node and fails', () => {
  const { s } = play('k8s-gpu-pod', ['kubectl create ns ml-team', 'kubectl run t --image=nvcr.io/nvidia/k8s/cuda-sample:vectoradd-cuda12.5.0 --restart=Never -n ml-team', 'kubectl get pods -n ml-team', 'kubectl get pods -n ml-team', 'kubectl get pods -n ml-team']);
  const p = s.st.k8s.pods.find(x => x.name === 't');
  assert.strictEqual(p.node, 'cpu-worker01');
  assert.strictEqual(p.phase, 'Error');
  assert.match(out('k8s-gpu-pod', ['kubectl run t --image=x --limits=nvidia.com/gpu=1']), /unknown flag: --limits/);
});
test('k8s: pods are immutable on re-apply', () => {
  const fixed = lab('k8s-gpu-pod').solution.find(x => typeof x !== 'string');
  const changed = { cmd: 'vi gpu-test.yaml', save: fixed.save.replace('nvidia.com/gpu: 1', 'nvidia.com/gpu: 2') };
  assert.match(out('k8s-gpu-pod', ['kubectl create ns ml-team', fixed, 'kubectl apply -f gpu-test.yaml', changed, 'kubectl apply -f gpu-test.yaml']), /Forbidden: pod updates may not change fields/);
});
test('k8s: get pod -o yaml round-trips through the YAML parser', () => {
  const y = out('k8s-gpu-pod', ['kubectl get pod llm-train-0 -n research -o yaml']);
  const doc = E._internal.parseYAML(y)[0];
  assert.strictEqual(doc.kind, 'Pod');
  assert.strictEqual(doc.spec.containers[0].resources.limits['nvidia.com/gpu'], 8);
  assert.strictEqual(doc.spec.nodeName, 'dgx-01');
});
test('k8s: double-quoted $oauthtoken expands to empty and is rejected', () => {
  assert.match(out('k8s-ngc-pull', ['kubectl create secret docker-registry s --docker-server=nvcr.io --docker-username="$oauthtoken" --docker-password=x -n inference']), /combination of --docker-username/);
});
test('k8s: secret already exists in default namespace', () => {
  assert.match(out('k8s-ngc-pull', ["kubectl create secret docker-registry ngc-secret --docker-server=nvcr.io --docker-username='$oauthtoken' --docker-password=x"]), /already exists/);
});
test('k8s: secret yaml decodes to the stored username', () => {
  const o = out('k8s-ngc-pull', ["kubectl create secret docker-registry s --docker-server=nvcr.io --docker-username='$oauthtoken' --docker-password=k -n inference", "kubectl get secret s -n inference -o jsonpath='{.data.\\.dockerconfigjson}' | base64 -d"]);
  assert.match(o, /"username":"\$oauthtoken"/);
});
test('k8s: pull without credentials reports insufficient_scope, wrong key reports 401 from proxy_auth', () => {
  const noCred = out('k8s-ngc-pull', ['kubectl describe pods -n inference']);
  assert.match(noCred, /insufficient_scope/);
  const patch = 'kubectl patch deployment triton -n inference -p \'{"spec":{"template":{"spec":{"imagePullSecrets":[{"name":"s"}]}}}}\'';
  const wrong = out('k8s-ngc-pull', ["kubectl create secret docker-registry s --docker-server=nvcr.io --docker-username='$oauthtoken' --docker-password=bad -n inference", patch, 'kubectl get pods -n inference', 'kubectl get pods -n inference', 'kubectl describe pods -n inference']);
  assert.match(wrong, /nvcr\.io\/proxy_auth.*401 Unauthorized/);
});
test('k8s: kubectl edit saves imagePullSecrets and rolls out a new pod', () => {
  const create = "kubectl create secret docker-registry ngc-secret --docker-server=nvcr.io --docker-username='$oauthtoken' --docker-password=\"$(cat ~/ngc-api-key.txt)\" -n inference";
  const { s } = play('k8s-ngc-pull', [create, 'kubectl edit deployment triton -n inference']);
  const ed = E.exec(s, 'kubectl edit deployment triton -n inference').editor;
  assert.ok(ed && /image: nvcr.io\/itqai\/inference\/triton-llm:24.08/.test(ed.content));
  const edited = ed.content.replace(/(\n\s+containers:\n)/, '\n      imagePullSecrets:\n      - name: ngc-secret$1');
  assert.strictEqual(E.save(s, ed, edited), 'deployment.apps/triton edited');
  assert.strictEqual(E.save(s, ed, edited), 'Edit cancelled, no changes made.');
  assert.match(E.save(s, ed, 'spec:\n  template: [oops'), /error/);
  assert.strictEqual(E.cancelEdit(ed), 'Edit cancelled, no changes made.');
  assert.ok(E.evaluate(s).every(r => r.ok));
});
test('k8s: default ServiceAccount imagePullSecrets path also works', () => {
  const create = "kubectl create secret docker-registry ngc-secret --docker-server=nvcr.io --docker-username='$oauthtoken' --docker-password=\"$(cat ~/ngc-api-key.txt)\" -n inference";
  const { s } = play('k8s-ngc-pull', [create, 'kubectl patch serviceaccount default -n inference -p \'{"imagePullSecrets":[{"name":"ngc-secret"}]}\'', 'kubectl rollout restart deployment triton -n inference']);
  assert.ok(E.evaluate(s).every(r => r.ok));
});

// Shell, parser and editor plumbing
test('shell builtins: export/echo/ls/cat/history/cd/pwd/unknown command', () => {
  assert.strictEqual(out('k8s-gpu-pod', ['export FOO=bar', 'echo $FOO ${FOO}']), 'bar bar');
  assert.strictEqual(out('k8s-gpu-pod', ['ls']), 'gpu-test.yaml');
  assert.match(out('k8s-gpu-pod', ['cat nope.txt']), /No such file/);
  assert.match(out('k8s-gpu-pod', ['pwd', 'history']), /1 {2}pwd/);
  assert.strictEqual(out('k8s-gpu-pod', ['cd /tmp']), '');
  assert.match(out('k8s-gpu-pod', ['frobnicate']), /command not found/);
  assert.match(out('k8s-gpu-pod', ["echo 'unterminated"]), /unexpected EOF/);
});
test('shell: pipes, grep -v, head, redirection and &&', () => {
  assert.strictEqual(out('k8s-gpu-pod', ['kubectl get nodes | grep -v NAME | head -n 1']).split(/\s+/)[0], 'cpu-worker01');
  assert.strictEqual(out('k8s-gpu-pod', ['echo hello > a.txt', 'cat a.txt']), 'hello');
  assert.strictEqual(out('k8s-gpu-pod', ['frob && echo no']), 'frob: command not found');
});
test('editor: vi on a new file saves its content', () => {
  const s = E.create(lab('k8s-gpu-pod'));
  const r = E.exec(s, 'vi notes.txt');
  assert.strictEqual(r.editor.content, '');
  assert.match(E.save(s, r.editor, 'x'), /written/);
  assert.strictEqual(E.exec(s, 'cat notes.txt').out, 'x');
});
test('yaml parser: rejects tab indentation and parses flow lists', () => {
  assert.throws(() => E._internal.parseYAML('a:\n\tb: 1'), /tab/);
  assert.deepStrictEqual(E._internal.parseYAML('a: [1, two]\nb: {c: d}')[0], { a: [1, 'two'], b: { c: 'd' } });
});
test('hostlist helpers compress and expand node ranges', () => {
  assert.strictEqual(E._internal.hostlist(['node001', 'node002', 'node004']), 'node[001-002,004]');
  assert.deepStrictEqual(E._internal.expandHosts('node00[1-3]'), ['node001', 'node002', 'node003']);
  assert.deepStrictEqual(E._internal.expandHosts('node001..node003'), ['node001', 'node002', 'node003']);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
