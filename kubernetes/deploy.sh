#!/bin/bash

NAMESPACE=monitoring

./01-configmap.sh $NAMESPACE
kubectl -n $NAMESPACE apply -f ./02-rbac.yml
kubectl -n $NAMESPACE apply -f ./03-graphite-node.yaml
until kubectl get pods -n monitoring | grep 'graphite-node' | grep Running ; do date; sleep 10; echo ""; done
kubectl -n $NAMESPACE apply -f ./04-graphite-master.yaml
kubectl -n $NAMESPACE apply -f ./05-carbon-relay.yaml