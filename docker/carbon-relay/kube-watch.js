const fs = require('fs');
const _ = require('lodash');
const Client = require('kubernetes-client').Client;
const config = require('kubernetes-client').config;
const client = new Client({ config: config.getInCluster() });
const JSONStream = require('json-stream');
const jsonStream = new JSONStream();
const configFileTemplate = "/opt/graphite/conf/carbon.conf.template";
const configFileTarget = "/opt/graphite/conf/carbon.conf";
const processToRestart = "carbon-relay";
const configTemplate = fs.readFileSync(configFileTemplate, 'utf8');
const exec = require('child_process').exec;
const namespace = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/namespace', 'utf8').toString();
const log = console;

function restartProcess() {
  exec(`supervisorctl restart ${processToRestart}`, (error, stdout, stderr) => {
    if (error) {
      log.error(error);
      return;
    }
    log.info(stdout);
    log.error(stderr);
  });
}

function getNodes(endpoints) {
  return endpoints.subsets ? _(endpoints.subsets[0].addresses)
    .sortBy(x => x.ip)
    .map(x => x.ip)
    .map(ip => `${ip}:2004`)
    .join(",") : "";
}

function changeConfig(endpoints) {
  const result = configTemplate.replace(/@@GRAPHITE_NODES@@/g, getNodes(endpoints));
  const targetFileExists = fs.existsSync(configFileTarget);
  const targetFileChanged = targetFileExists ? fs.readFileSync(configFileTarget, 'utf8') !== result : false;
  const shouldWriteFile = !targetFileExists || targetFileChanged;
  if (shouldWriteFile) {
    log.info(`Writing config file to ${configFileTarget}`);
    fs.writeFileSync(configFileTarget, result);
    restartProcess();
  } else {
    log.info(`Received update but there is no change in config file`);
  }
}

async function main() {
  await client.loadSpec();
  const stream = client.api.v1.namespaces(namespace).endpoints.getStream({ qs: { watch: true, fieldSelector: 'metadata.name=graphite-node' } });
  stream.pipe(jsonStream);
  jsonStream.on('data', obj => {
    if (!obj) {
      return;
    }
    log.info('Received update:', JSON.stringify(obj));
    changeConfig(obj.object);
  });
}

try {
  main();
} catch (error) {
  log.error(error);
  process.exit(1);
}
