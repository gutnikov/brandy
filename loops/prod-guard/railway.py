#!/usr/bin/env python3
"""Railway calls for prod-guard, with a project token scoped to the production environment.

  railway.py rollback        roll the service back to the last good deployment of another commit
                             (DRY_RUN=1: print what it would do)

Env: RAILWAY_TOKEN (project token), RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID, RAILWAY_SERVICE_ID.
"""
import json
import os
import sys
import urllib.request

API = "https://backboard.railway.com/graphql/v2"
GOOD = {"SUCCESS", "SLEEPING", "REMOVED"}  # REMOVED: replaced by a newer deployment after it ran


def gql(query, variables=None):
    req = urllib.request.Request(API, data=json.dumps({"query": query, "variables": variables or {}}).encode(),
                                 headers={"Content-Type": "application/json",
                                          # Railway's API sits behind Cloudflare, which answers 403 to the default
                                          # Python-urllib user agent.
                                          "User-Agent": "brandy-prod-guard/1",
                                          "Project-Access-Token": os.environ["RAILWAY_TOKEN"]})
    with urllib.request.urlopen(req, timeout=30) as r:
        out = json.load(r)
    if out.get("errors"):
        sys.exit("railway.py: %s" % out["errors"][0].get("message"))
    return out["data"]


def deployments():
    d = gql("""query($p:String!,$e:String!,$s:String!){ deployments(first:20, input:{projectId:$p,
              environmentId:$e, serviceId:$s}) { edges { node { id status createdAt meta } } } }""",
            {"p": os.environ["RAILWAY_PROJECT_ID"], "e": os.environ["RAILWAY_ENVIRONMENT_ID"],
             "s": os.environ["RAILWAY_SERVICE_ID"]})
    return [e["node"] for e in d["deployments"]["edges"]]  # newest first


def commit(dep):
    return (dep.get("meta") or {}).get("commitHash") or ""



def rollback():
    deps = deployments()
    if not deps:
        sys.exit("railway.py: no deployments")
    current = commit(deps[0])
    target = next((d for d in deps[1:] if d["status"] in GOOD and commit(d) != current), None)
    if not target:
        sys.exit("railway.py: no earlier good deployment to roll back to")
    print("rollback: %s (%s) -> %s (%s)" % (deps[0]["id"], current[:7], target["id"], commit(target)[:7]))
    if os.environ.get("DRY_RUN"):
        return
    gql("mutation($id:String!){ deploymentRollback(id:$id) }", {"id": target["id"]})


if __name__ == "__main__":
    if sys.argv[1:] == ["rollback"]:
        rollback()
    else:
        sys.exit(__doc__)
