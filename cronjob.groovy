pipeline{
    agent any
    triggers {
        cron 'H 23 * * *'
    }
    options {
        buildDiscarder(logRotator(numToKeepStr: '7'))
    }
    stages{
        stage('CleanJob'){
            steps{
                script{
                    sh '''
                    set +x
                    source /etc/profile
                    cd $WORKSPACE
                    rm -rf log.txt
                    echo "start:"`date` >> log.txt
                    npm install
                    ts-node cronjob.ts start
                    echo "end:"`date` >> log.txt
                    '''
                }
            }
        }
        stage('Archive') {
            steps {
                archiveArtifacts artifacts: 'log.txt', followSymlinks: false
            }
        }
    }
}