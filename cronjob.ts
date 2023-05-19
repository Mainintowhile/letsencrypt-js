const fs = require('fs');
const shell = require('shelljs');
const OSS = require('ali-oss')
import Cdn20180510, * as $Cdn20180510 from '@alicloud/cdn20180510';
import * as $OpenApi from '@alicloud/openapi-client';
import * as $Util from '@alicloud/tea-util';

const SCRIPTPATH ='./cronjob.ts'
const CERTCONFIGPATH = '/yourpath1'
const CERTWORKPATH = '/yourpath2'
const CERTNAME='yourname'
const EXPIREDAYSLIMIT = 30 //过期时间小于x天时更新
const EMAIL = 'yourmail'
const DOMAIN = 'yourdomain.com'
const ACMSERVER='https://acme-v02.api.letsencrypt.org/directory'
const AUTHDIR='.well-known/acme-challenge'

const OSSREGION='yourossorigin'
const OSSBUCKET='yourossbucket'
const OSSACCESSKEYID='yourramkeyid'
const OSSACCESSKEYSECRET='yourramsecret'

//certbot 操作
class certbot {
    //采用http 验证方案，certbot将验证信息写入环境变量 -> auth将验证信息文件传到oss -> acm验证http://domain/.well-known/acme-challenge/validatefile
    //生成证书或更新证书  return：1成功；-1失败
    genOrRenew(cmd:string):number{
        //配置文件路径判断
        var mkConfigDirCmd =`mkdir ${CERTCONFIGPATH} -p`
        let mkConfigDirOut = shell.exec(mkConfigDirCmd)
        if (mkConfigDirOut.code !== 0) {
            writeFile(cmd,"mkConfigDir命令运行失败"+mkConfigDirOut.stdout);
            return -1
        }
        writeFile(cmd,'mkConfigDirOut:'+mkConfigDirOut.stdout)

        //工作目录检查
        var mkWorkDirCmd =`mkdir ${CERTWORKPATH} -p`
        let mkWorkDirOut = shell.exec(mkWorkDirCmd)
        if (mkWorkDirOut.code !== 0) {
            writeFile(cmd,"mkWorkDir命令运行失败"+mkWorkDirOut.stdout);
            return -1
        }
        writeFile(cmd,'mkWorkDirOut:'+mkWorkDirOut.stdout)

        //生成证书 todo 去掉 --test-cert --break-my-certs
        //测试用    var authCmd =`certbot certonly -m ${EMAIL} --force-renewal --agree-tos --preferred-challenges http --test-cert --break-my-certs --manual \
        var authCmd =`certbot certonly -m ${EMAIL} --force-renewal --agree-tos --preferred-challenges http --server ${ACMSERVER} --manual \
        --config-dir ${CERTCONFIGPATH} \
        --work-dir ${CERTWORKPATH} \
        --manual-auth-hook 'ts-node ${SCRIPTPATH} auth' \
        --manual-cleanup-hook 'ts-node ${SCRIPTPATH} cleanup' -d ${DOMAIN}`
        let authOut = shell.exec(authCmd)
        if (authOut.code !== 0) {
            writeFile(cmd,"genOrRenew命令运行失败"+authOut.stdout);
            return -1
        }
        writeFile(cmd,'genOrRenew:'+authOut.stdout)
        return 1
    }

    //通过certbot获取证书有效期
    getExpireDays(cmd:string):number{
/*
有证书时输出：
Saving debug log to xx/letsencrypt.log
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Found the following certs:
Certificate Name: xx
    Serial Number: xx
    Key Type: RSA
    Domains: xx
    Expiry Date: xxxx-xx-xx xx:xx:xx+xx:xx (VALID: xx days)
    Certificate Path: pathx/fullchain.pem
    Private Key Path: pathx/privkey.pem
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
无证书时输出：
Saving debug log to xx/letsencrypt.log
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
No certificates found.
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
*/
        let authCmd = `certbot certificates --config-dir ${CERTCONFIGPATH} --work-dir ${CERTWORKPATH} --cert-name ${DOMAIN}`
        let authOut = shell.exec(authCmd)
        if (authOut.code !== 0) {
            writeFile(cmd,"getExpireDays命令运行失败"+authOut.stdout);
            return 0
        }
        writeFile(cmd,'getExpireDays:'+authOut.stdout)

        var re = new RegExp(`VALID:(.*)days`);
        var arr = re.exec(authOut)
        if (!!arr && arr.length>=2){
            var days =parseInt(arr[1])
            if(!!days){
                writeFile(cmd,'getExpireDays:'+days)
                return days
            }
        }
        return 0
    }
}

/**
 * oss 操作
 */
class OssOp {
    static createClient(accessKeyId: string, accessKeySecret: string): any {
        let client = new OSS({
            // yourregion填写Bucket所在地域。以华东1（杭州）为例，Region填写为oss-cn-hangzhou。
            region: OSSREGION,
            // 阿里云账号AccessKey拥有所有API的访问权限，风险很高。强烈建议您创建并使用RAM用户进行API访问或日常运维，请登录RAM控制台创建RAM用户。
            accessKeyId: accessKeyId,
            accessKeySecret: accessKeySecret,
            // 填写Bucket名称。
            bucket: OSSBUCKET,
          });
          return client
    }
    //上传本地文件
    async put (cmd:string):Promise<number> {
        const headers = {
            // 指定Object的存储类型。
            'x-oss-storage-class': 'Standard',
            // 指定Object的访问权限。
            'x-oss-object-acl': 'public-read',
            // 通过文件URL访问文件时，指定以附件形式下载文件，下载后的文件名称定义为example.jpg。
            // 'Content-Disposition': 'attachment; filename="example.jpg"'
            // 设置Object的标签，可同时设置多个标签。
            'x-oss-tagging': 'Tag1=1&Tag2=2',
            // 指定PutObject操作时是否覆盖同名目标Object。此处设置为true，表示禁止覆盖同名Object。
            'x-oss-forbid-overwrite': 'false',
          };
        try {
            let client = OssOp.createClient(OSSACCESSKEYID, OSSACCESSKEYSECRET);
            // 填写OSS文件完整路径和本地文件的完整路径。OSS文件完整路径中不能包含Bucket名称。
            // 如果本地文件的完整路径中未指定本地路径，则默认从示例程序所属项目对应本地路径中上传文件。
            let fileName = process.env.CERTBOT_TOKEN 
            let fileToken = process.env.CERTBOT_VALIDATION
            writeFile(cmd,"filename:"+fileName)
            writeFile(cmd,"filetoken:"+fileToken)
            if(!fileName){
                writeFile(cmd,"put file failed")
                return Promise.resolve(-1)
            }
            if(!fileToken){
                writeFile(cmd,"put file failed")
                return Promise.resolve(-1)
            }
            let buf =Buffer.from(fileToken)
            const result = await client.put(`${AUTHDIR}/${fileName}`, buf,{headers});
            console.log(result)
            writeFile(cmd,"oss put done"+fileName);
            return Promise.resolve(1)
        } catch (error) {
            console.log(error)
            writeFile(cmd,"oss put file fail")
            return Promise.resolve(-1)
        }
      }

      //删除文件
      async delete (cmd:string):Promise<number> {
        let client = OssOp.createClient(OSSACCESSKEYID, OSSACCESSKEYSECRET);
        client.useBucket(OSSBUCKET);
        let fileName = process.env.CERTBOT_TOKEN
        writeFile(cmd,"filename:"+fileName)
        if(!fileName){
            writeFile(cmd,"put file failed")
            return Promise.resolve(-1)
        }
        try {
            // 填写Object完整路径。Object完整路径中不能包含Bucket名称。
            let result = await client.delete(`${AUTHDIR}/${fileName}`);
            console.log(result)
            writeFile(cmd,"oss delete done"+fileName)
            return Promise.resolve(1)
          } catch (error) {
            console.log(error)
            writeFile(cmd,"oss.delete fail"+fileName)
            return Promise.resolve(-1)
          }
      }
}

/**
 * cdn https证书操作
 */
class cdncert {
    /**
     * 使用AK&SK初始化账号Client
     * @param accessKeyId
     * @param accessKeySecret
     * @return Client
     * @throws Exception
     */
    static createClient(accessKeyId: string, accessKeySecret: string): Cdn20180510 {
        let config = new $OpenApi.Config({
        accessKeyId: accessKeyId,
        accessKeySecret: accessKeySecret,
        });
        // 访问的域名
        config.endpoint = `cdn.aliyuncs.com`;
        return new Cdn20180510(config);
    }
    
    //修改cdn https的证书信息
    async put(cmd:string): Promise<number> {
        var publicCert=fs.readFileSync(`${CERTCONFIGPATH}/live/${DOMAIN}/fullchain.pem`,"utf-8");
        var privateCert=fs.readFileSync(`${CERTCONFIGPATH}/live/${DOMAIN}/privkey.pem`,"utf-8");
        writeFile(cmd,"public:"+publicCert)
        writeFile(cmd,"private:"+privateCert)
        if (!publicCert){
            writeFile(cmd,"获取publicCert失败")
            return Promise.resolve(-1)
        }
        if (!privateCert){
            writeFile(cmd,"获取privateCert失败")
            return Promise.resolve(-1)
        }
        // 工程代码泄露可能会导致AccessKey泄露，并威胁账号下所有资源的安全性。以下代码示例仅供参考，建议使用更安全的 STS 方式，更多鉴权访问方式请参见：https://help.aliyun.com/document_detail/378664.html
        let client = cdncert.createClient(OSSACCESSKEYID, OSSACCESSKEYSECRET);
        let setDomainServerCertificateRequest = new $Cdn20180510.SetDomainServerCertificateRequest({
            domainName: DOMAIN,
            certName: CERTNAME,
            certType: "upload",
            serverCertificateStatus: "on",
            serverCertificate: publicCert,
            privateKey: privateCert,
            forceSet: "1",
        });
        let runtime = new $Util.RuntimeOptions({ });
        try {
            // 复制代码运行请自行打印 API 的返回值
            let result =  await client.setDomainServerCertificateWithOptions(setDomainServerCertificateRequest, runtime);
            console.log(cmd,result)
            writeFile(cmd,"setDomainServerCertificateWithOptions done")
            return Promise.resolve(1)
        } catch (error) {
            // 如有需要，请打印 error
            console.log(error)
            writeFile(cmd,"setDomainServerCertificateWithOptions fail");
            return Promise.resolve(-1)
        }    
    }
}

function writeFile(cmd:string,msg:string):void {
    //console.log(cmd+":"+msg)
    fs.appendFile('./log.txt',msg+'\n' , (error:any):void  => {})
}


/*
* 主入口
* 1 用于jenkins调用 完成流程处理，过期判断|证书生成|证书renew，https更新
* 2 pre-hook       
* 3 cleanup-hook
* 用法：ts-node xx.ts [start,auth,cleanup]
*/
class entrance {
    static async main(args: string[]): Promise<void> {
        if(args.length != 1){
            writeFile("","参数错误");
            return Promise.reject()
        }
        writeFile(args[0],'dealing with certbot');

        switch(args[0]){
            case "start"  :
                //过期判断
                writeFile(args[0],'getExpireDays');
                var certBotClass = new certbot()
                let days = certBotClass.getExpireDays(args[0])
                if(days>=EXPIREDAYSLIMIT){
                    writeFile(args[0],'未过期，不做处理');
                    return Promise.resolve()
                }

                //证书生成|证书renew
                writeFile(args[0],'genOrRenew');
                let retCode = certBotClass.genOrRenew(args[0])
                if (retCode < 0){
                    writeFile(args[0],'证书生成失败');
                    return Promise.reject()
                }

                //cdn https更新
                writeFile(args[0],'cdncert.put');
                let cdnClass = new cdncert()
                let putTlsCode = await cdnClass.put(args[0])
                if (putTlsCode < 0){
                    writeFile(args[0],'证书生成失败');
                    return Promise.reject()
                }
               break;
            case  "auth" :
                let ossOpClass1 = new OssOp()
                let authret =await ossOpClass1.put(args[0])
                if( authret < 0){
                    writeFile(args[0],'put fail:')
                    return Promise.reject()
                }
               break; 
            case "cleanup" : 
                let ossOpClass2 = new OssOp()
                let cleanupret =await ossOpClass2.delete(args[0])
                if( cleanupret < 0){
                    writeFile(args[0],'delete fail:')
                    return Promise.reject()
                }
        }
        writeFile(args[0],'done');
        return Promise.resolve()
    }
}

entrance.main(process.argv.slice(2))