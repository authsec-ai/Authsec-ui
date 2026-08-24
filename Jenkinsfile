// AuthSec UI — Hetzner single-node deploy.
//
// THIS FILE IS THE PIPELINE. It only runs if the Jenkins job is configured as
// "Pipeline script from SCM" pointing at this path. If the job holds an inline
// script instead, this file is decorative and editing it changes nothing — which
// was the state until now, and cost real debugging time.
//
// Job configuration this expects (set once, in Jenkins):
//   Definition   Pipeline script from SCM
//   SCM          Git — https://github.com/authsec-ai/Authsec-ui.git
//   Credentials  github-pat
//   Branch       */authsec-staging
//   Script Path  Jenkinsfile
//
// Consequence worth knowing: only authsec-staging deploys. Pushing any other
// branch does nothing at all — no build, no error. That is deliberate, and the
// Identify stage below prints what shipped so it is never a mystery.
//
// There is no Checkout stage: with SCM-defined pipelines Jenkins has already
// checked the repo out into the workspace before it reads this file.

pipeline {
    agent any

    triggers { githubPush() }

    options {
        buildDiscarder logRotator(numToKeepStr: '15')
        disableConcurrentBuilds()
        timeout(time: 20, unit: 'MINUTES')
        timestamps()
    }

    environment {
        SERVICE   = 'ui'
        IMAGE     = 'authsec-ui:latest'
        ROLLBACK  = 'authsec-ui:previous'
        STACK_DIR = '/opt/authsec'
        // The UI container is a Node server on 3000, not nginx. Checked
        // internally so a proxy problem cannot fail an app deploy.
        HEALTH_URL = 'http://127.0.0.1:3000'
        // Baked in at BUILD time by Vite — the bundle is static afterwards, so
        // these cannot be changed by editing the compose environment later.
        VITE_API_URL        = 'https://app.authsec.ai'
        VITE_OAUTH_BASE_URL = 'https://app.authsec.ai'
        VITE_APP_NAME       = 'AuthSec'
    }

    stages {
        stage('Identify') {
            steps {
                script {
                    // Recorded once so the post block can name the commit
                    // without shelling out again.
                    env.DEPLOY_SHA = sh(returnStdout: true,
                        script: 'git rev-parse --short HEAD').trim()
                }
                sh '''
                    echo "branch : $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached)"
                    echo "commit : $(git rev-parse --short HEAD)"
                    echo "subject: $(git log -1 --pretty=%s)"
                    echo "author : $(git log -1 --pretty=%an)"
                '''
            }
        }

        stage('Tag rollback point') {
            steps {
                sh '''
                    if docker image inspect "$IMAGE" >/dev/null 2>&1; then
                        docker tag "$IMAGE" "$ROLLBACK"
                        echo "rollback point: $(docker image inspect "$ROLLBACK" --format '{{.Id}}')"
                    else
                        echo "no existing image — first deploy, nothing to roll back to"
                    fi
                '''
            }
        }

        stage('Build') {
            steps {
                sh '''
                    DOCKER_BUILDKIT=1 docker build \
                      --build-arg VITE_API_URL="$VITE_API_URL" \
                      --build-arg VITE_OAUTH_BASE_URL="$VITE_OAUTH_BASE_URL" \
                      --build-arg VITE_APP_NAME="$VITE_APP_NAME" \
                      -t "$IMAGE" .
                '''
            }
        }

        stage('Deploy') {
            steps {
                dir("${STACK_DIR}") {
                    sh 'docker compose up -d --no-deps --force-recreate "$SERVICE"'
                }
            }
        }

        stage('Health check') {
            steps {
                script {
                    def healthy = sh(returnStatus: true, script: '''
                        for i in $(seq 1 30); do
                            if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
                                echo "serving after ${i} attempt(s)"
                                exit 0
                            fi
                            sleep 5
                        done
                        exit 1
                    ''') == 0

                    if (!healthy) {
                        echo 'HEALTH CHECK FAILED — rolling back'
                        sh '''
                            if docker image inspect "$ROLLBACK" >/dev/null 2>&1; then
                                docker tag "$ROLLBACK" "$IMAGE"
                                cd "$STACK_DIR"
                                docker compose up -d --no-deps --force-recreate "$SERVICE"
                                for i in $(seq 1 24); do
                                    curl -fsS "$HEALTH_URL" >/dev/null 2>&1 && { echo "rolled back and serving"; exit 0; }
                                    sleep 5
                                done
                                echo "ROLLBACK DID NOT COME BACK — needs a human"
                                exit 0
                            else
                                echo "no rollback image available — UI is down"
                                exit 0
                            fi
                        '''
                        error 'Deploy failed health check; previous image restored'
                    }
                }
            }
        }

        stage('Reclaim disk') {
            steps {
                // A full npm install + vite build every deploy is the biggest
                // build-cache producer on this box. Bounded, not emptied.
                sh '''
                    docker builder prune -f --max-used-space 4GB || true
                    docker image prune -f || true
                    df -h / | tail -1
                '''
            }
        }
    }

    post {
        success { echo "UI deployed: ${env.DEPLOY_SHA}" }
        failure { echo "UI deploy FAILED — check the Health check stage; a rollback may have run" }
    }
}
