# letsencrypt-js

```
简介：
    自动化将=更新免费https证书letsencrypt
    使用jenkins的pipeline（cronjob.groovy）调用typescript(cronjob.ts)管理letsencrypt(certbot)证书，每天执行。
    主要流程：
        创建jenkins item；将cronjob.groovy内容写入pipeline
        通过配置代码仓等方式将cronjob.ts,package.json引入worspace

原理说明：
    文档： https://eff-certbot.readthedocs.io/en/stable/using.html#manual
    1 certbot 验证域名方案：http，将文件放到域名指向的bucket目录
    2 Certbot 创建+更新证书
    3 续签后，证书会变化。续签相当于重新签名
    4 hook原理：certbot调用hook时将验证信息写入环境变量，hook获取变量传到域名指定路径(oss)，
    5 通过阿里cdn的api将生成的证书更新到绑定的域名

其他：
    安装certbot(jenkins环境)
    yum install epel-release -y
    yum install certbot -y
    npm install -g typescript
    npm install -g ts-node
    npm install --save @alicloud/cdn20180510@1.2.8

```