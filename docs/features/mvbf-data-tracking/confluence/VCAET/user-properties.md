# User Properties

<!--
==============================================================
SOURCE TRACKING — 更新 Confluence 後請同步更新此區塊與內文
==============================================================

page_id:        96043154
url:            https://viewsonic-vsi.atlassian.net/wiki/spaces/VCAET/pages/96043154/User+Properties
space:          VCAET
cloned_version: 96
cloned_at:      2026-05-28

Confluence space: VCAET（VSX ClassSwift Amplitude Event Tracking）
Maintenance rule: 每次重新 clone 時，先 commit「同步前差異」說明，再覆寫此檔；
                  版號跟 cloned_at 要同步更新，commit 訊息附 Confluence URL。
==============================================================
-->

> | 來源頁面 | page_id | clone 版本 | clone 日期 |
> |---|---|---|---|
> | [👨‍👩‍👧‍👦 User Properties](https://viewsonic-vsi.atlassian.net/wiki/spaces/VCAET/pages/96043154/User+Properties) | 96043154 | v96 | 2026-05-28 |

---

### User Data

| **Attribute** | **Value** | **Definition** | **Remark** |
| --- | --- | --- | --- |
| user id |  | 1. teacher : 使用者ID, 按資料庫 users.user_id的值 2. student：使用者ID, 按資料庫 users.user_id的值，並經過MD5轉換 |  |
| sign up timestamp | 1720540800 | 使用者帳號建立時間, 按資料庫 users.created_at的值 | Sever端發送事件才有 |
| sign up datetime | 2024/7/10 | sign up timestamp 轉換成 human readable | Sever端發送事件才有 |
| display name | Wang Xiao Ming | 使用者名稱在系統顯示名稱, 按資料庫 users.first+" "+users.last | 老師端才要 |
| classswift country | US | 按資料庫 users.country的值 | 請確認各平台送出資料是否有帶country資訊/Mac再確認 |
| joined from | ClassLink / Canvas / Google Classroom | 用戶是從何處加入ClassSwift | 目前透過LMS Roster進來的用戶才需要（才可辨認）此欄位，[Teacher Import]事件所帶的 user prop |
| email | xxxxx@viewsomic.com | user email | 只出現在以下 events  [Subscription Opened] - CS提供，通知信的收件者  [User Property Updated] - ClassSwift Database user.email |
| Version |  | 專案版本號，覆寫Amplitude property |  |
| is internal user | True/False | 是否為內部名單，目前以過濾email domain為 "[viewsonic.com](http://viewsonic.com)", "yopmail.com" | [User Property Updated] only |

### Role

| **Attribute** | **Value** | **Data Type** | **定義** | **Remark** |
| --- | --- | --- | --- | --- |
| role | Student / Teacher / Admin / Owner/ VIP | String | Student : 以學生角度加入ClassSwift（Join Class or …），登入或訪客  Teacher : 選取組織後確認為Teacher角色  Admin : 選取組織後確認為Admin角色  部分資料從 ClassSwift Database 而來的 role 資料（[User Property Updated]寫入） |  |

### 💡 Login Data （不論platfrom為何，未來起始事件都要帶此data)

| **Attribute** | **Value** | **Data Type** | **定義** | **Remark** |
| --- | --- | --- | --- | --- |
| login method | ClassLink/ViewSonic/QR code/Google/Mircosoft/Automatic | String | 透過vs account protal 登入 | 1. Windows App透過vs account protal，都是ViewSonic 2. 學生端可以分辨 3. Android: 可以透過使用者點擊分辨，QR code只有for Android 4. Automatic: 拿到token自動登入，無法分辨 |
| ~~login from~~ | ~~TeacherApp/Hub/Participant / ProductPage~~ | ~~String~~ |  |  |
| ~~platform~~ | ~~Windows / Mac / Android / Web~~ | ~~String~~ | ~~使用平台~~ |  |
| is login | True / False | String | 判斷是否登入/訪客模式 | Only 學生端使用 |

### Current Org Data （Only 老師端）

| **Attribute** | **Value** | **Data Type** | **定義** | **Remark** |
| --- | --- | --- | --- | --- |
| current org id | 9ded95c7-54bb-4382-9299-b5db741da5f8 | String | 組織ID, 按資料庫 organization.org_id的值 |  |
| current org name | 優派小學 | String | 組織之組織名稱, 按資料庫 organization.name的值 |  |
| current org is individual | True/False | String | 是否為個人組織, 按資料庫 organization.is_individual的值 |  |
| current plan type | Advanced | String | 組織對應最新的方案 |  |
| ~~current plan start date~~ | 2025/01/01 | Datetime | 組織對應最新的方案起日 |  |
| current plan end date | 2025/12/31 | Datetime | 組織對應最新的方案到期日 |  |
| ~~current org created timestamp~~ | ~~1708905600~~ | ~~int~~ | ~~組織建立時間~~ | 此欄位隨著使用者切換不同組織而變動，若不同平台未同時新增此欄位，會有資料無同步更新之使用錯誤。此資訊已放到entity property |
| ~~current org created datetime~~ | ~~2024-02-26 00:00:00 GMT~~ | ~~Datetime~~ | ~~組織建立時間~~ | 同上 |

### Orgs Detail Data（Only 老師端）:

| **Attribute** | **Value** | **Data Type** | **定義** | **Remark** |
| --- | --- | --- | --- | --- |
| orgs detail | [{org id:xxx, org name:ooo…},  {org id:AAA, org name:BBB…}] | List[{}, {}] | 放所有組織以及相關資訊 |  |

| **Attribute** | **Value** | **Data Type** | **定義** | **Remark** |
| --- | --- | --- | --- | --- |
| org id | 9ded95c7-54bb-4382-9299-b5db741da5f8 | String | 組織ID, 按資料庫 organization.org_id的值 |  |
| org name | 優派小學 | String | 組織之組織名稱, 按資料庫 organization.name的值 |  |
| org is individual | True/False | String | 是否為個人組織, 按資料庫 organization.is_individual的值 |  |
| plan type | Advanced | String | 組織對應最新的方案 |  |
| *~~plan start date~~* | *~~2025/01/01 00:00:00 GMT~~* | *~~Datetime~~* | *~~組織對應最新的方案起日~~* |  |
| plan end date | 2025/12/31 00:00:00 GMT | Datetime | 組織對應最新的方案到期日 |  |
| ~~org created timestamp~~ | ~~1708905600~~ | ~~int~~ | ~~組織建立時間~~ |  |
| ~~org created datetime~~ | ~~2024-02-26 00:00:00 GMT~~ | ~~Datetime~~ | ~~組織建立時間~~ |  |

example :

```json
"user_properties": {
  "login method": "ViewSonic",
  "platform": "Mac",
  "classswift_country": "Taiwan",
  "create_from": "mvb",
  "current_org_id": "30db7c22-4656-4496-a525-6162c0794a73",
  "current_org_is_individual": false,
  "current_org_name": "ViewSonic全球教育家認證",
  "current_plan_end_date": "2023-12-31 23:59:59 GMT",
  "current_plan_type": "advanced",
  "default_display_name": "188",
  "orgs_detail": [
    {
      "org_id": "24d53a29-9308-4d64-a832-023a21422566",
      "org_is_individual": true,
      "org_name": "麗鴻",
      "plan_end_date": "2027-01-01 00:00:00 GMT",
      "plan_type": "advanced"
    },
    {
      "org_id": "30db7c22-4656-4496-a525-6162c0794a73",
      "org_is_individual": false,
      "org_name": "ViewSonic全球教育家認證",
      "plan_end_date": "2023-12-31 23:59:59 GMT",
      "plan_type": "advanced"
    },
    {
      "org_id": "911ebf35-d8f8-46aa-a125-8700d88bc692",
      "org_is_individual": false,
      "org_name": "20230928080254782-ViewSonic Education",
      "plan_end_date": "2024-12-31 00:00:00 GMT",
      "plan_type": "advanced"
    },
    {
      "org_id": "b6669fc5-c94a-4442-9533-22812bf2a9dc",
      "org_is_individual": false,
      "org_name": "臺中市龍井國民小學",
      "plan_end_date": "2025-08-31 00:00:00 GMT",
      "plan_type": "advanced"
    }
  ],
  "sign_up_datetime": "2024-02-26 00:00:00 GMT",
  "sign_up_timestamp": 1708905600,
  "user_id": "24d53a29-9308-4d64-a832-023a21422566"
}
```

### User Preference

| **Attribute** | **Value** | **Data Type** | **定義** | **Remark** |
| --- | --- | --- | --- | --- |
| **teacher standard set** | CCSS | String | 教師所選用的課綱標準設定 | 例如: CCSS, NGSS, 108課綱 |
| **teacher subjects** | ["Mathematics", "Physics"] | Array<String> | 教師所教授的科目列表 | 若為單一科目亦存為陣列格式，或視需求支援單一字串 |
| **teacher grades** | ["10", "11"] | Array<String> | 教師所教授的年級列表 | 若為單一年級亦存為陣列格式，或視需求支援單一字串 |

### Device Data

| **User Properties** | **Data Type** | **Value / Example** | **Definition** | **Remark** |
| --- | --- | --- | --- | --- |
| country | string | US/TW | 判別使用者的國家 |  |
| city | string | Taipei / New York | 判別使用者的城市 |  |
| platform | string | Windows / MacOS / ChromeOS / Android | 判別mvb平台 |  |
| device model | string | IFP5550-5 | 判別機器型號(IFP) | 若該裝置是沒有device model的值，請帶na |
| app version | string | 3.7.5 | 版本採用率 |  |
| instance id | string | (UUID) | 每次安裝mvb的unique ID |  |
| device brand | string | ViewSonic / Acer | 識別非 ViewSonic 裝置佔比 |  |
| device type | string | ifp / desktop / laptop / tablet / phone | 裝置類別 |  |
| model series | string | 50 / 52 / N/A | IFP 系列分析 |  |
| os version | string | Windows 11 23H2 | 找舊 OS 卡關使用者 |  |
| edid | string | 4019 | model key | 若該裝置是沒有edid的值，請帶na |
