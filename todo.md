# TODO（ユーザー対応事項）

状態異常システム実装後に、ユーザー側で対応が必要な作業をまとめる。

---

## 画像作成

### 状態異常アイコン（HUD デバフ表示 + 敵頭上表示）

**配置フォルダ：** `graphic/ui/icon/icon_ailment/`

**ファイル名規則：** `icon_ailment_{ailmentId}.png`

| ailmentId | ファイル名 | 暫定テキストラベル |
|---|---|---|
| bleed | `icon_ailment_bleed.png` | BL |
| poison | `icon_ailment_poison.png` | PS |
| burn | `icon_ailment_burn.png` | BN |
| chill | `icon_ailment_chill.png` | CH |
| freeze | `icon_ailment_freeze.png` | FZ |
| shock | `icon_ailment_shock.png` | SK |
| paralyze | `icon_ailment_paralyze.png` | PZ |
| brittle | `icon_ailment_brittle.png` | BR |

**サイズ：** 16×16px PNG

**フォールバック：** 画像がない場合は上記テキストラベルで代替表示（実装済み）。HUD・敵頭上どちらにも共通して使う画像ファイル。

- [ ] 上記 8 ファイルを作成して `graphic/ui/icon/icon_ailment/` に配置する
- [ ] 状態異常エフェクトアニメーション（DoT 発生時エフェクト：炎・毒煙・血など）← 別途検討

---

## パラメータ確認・調整

- [ ] `A_APPLY = 0.02`（ARC 依存の付与量係数）の最終値を決定して `ailmentDb.js` を更新
- [x] `A_DOT = 0.02` に決定（A_APPLY と統一。ARC+1 につき DoT+2%）
- [ ] 感電の追加ダメージが「非クリ基準」か「全ダメージ基準」かを確定
  - 現在の実装：`getShockBonusDmgMult` を全ダメ（`roll.damagePerHit`）に乗算している
- [ ] 各状態異常のバランス調整（`ailmentDb.js` の maxStacks / durationPerStack / dotCoef など）

---

## スキル JSON 作成

以下の状態異常を付与するスキルチップ JSON が未作成。必要に応じて追加する。

- [ ] 出血付与スキル（例：`skill_id_bleed_01.json`）
- [ ] 燃焼付与スキル（例：`skill_id_burn_01.json`）
- [ ] 冷却付与スキル（例：`skill_id_chill_01.json`）
- [ ] 感電付与スキル（例：`skill_id_shock_01.json`）
- [ ] 脆化付与スキル（例：`skill_id_brittle_01.json`）

スキル JSON の `modifier` 型・`applyAilments` フィールドに `ailmentId` と `applyBase` を指定する。
```json
{
  "id": "skill_id_bleed_01",
  "type": "modifier",
  "applyAilments": [{ "ailmentId": "bleed", "applyBase": 1.5 }]
}
```

---

## 仕様確定

- [ ] spec section 9 の TODO（一次ステータスの表示名、ARC 係数の割り振り）を確定して spec を更新
- [ ] 感電の最終表現（連鎖 or 追加ダメ）を決定
  - 現在の実装：「雷タグ付き攻撃」ヒット時に追加ダメ乗数として適用
  - attack.tags に `"lightning"` を含む攻撃に対して `getShockBonusDmgMult` が適用される
- [ ] プレイヤーへの状態異常付与仕様（どの敵スキルが何を付与するか）を敵キャラ仕様に追記
- [ ] 将来実装：`player_effects[]`（section 8.5）の永続化対応

---

## 将来実装（今回スコープ外）

- [ ] リアクション（毒×氷→脆化、炎×毒→爆燃 など）
- [ ] 冷却による攻撃速度ペナルティ（武器クールダウンへの組み込み）
- [ ] 状態異常アイコンの画像差し替え（現在テキストのみ）
- [ ] プレイヤー状態異常の全種対応（基盤は完成、敵スキル定義待ち）
