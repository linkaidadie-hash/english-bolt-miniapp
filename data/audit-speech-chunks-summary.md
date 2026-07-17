# speechChunks 审计报告 (2026-07-17T12:23:06.583Z)

**总计**: 180 句 / **异常**: 25 句

## 检查项

| # | 检查 | 通过 | 失败 |
|---|---|---|---|
| 1 | chunks 拼接 == clearText | 180 | 0 |
| 2 | chunk 质量（无截断） | 155 | 25 |
| 3 | chunks 非空 | 180 | 0 |
| 4 | speechChunks.length == audioSegmented.length | 180 | 0 |
| 5 | audioSegmented.text == chunks | 180 | 0 |


## 异常详情 (25)

### weak-form/wf-04

- clear: `Do you have a pen`
- natural: `D'you have a pen`
- chunks: `["Do you","have a","pen"]`

- **truncated_chunks**:
  - chunk[2]: `pen` (truncated_token:pen)

### weak-form/wf-11

- clear: `I'm looking for a job`
- natural: `I'm lookin' for a job`
- chunks: `["I'm","looking for a","job"]`

- **truncated_chunks**:
  - chunk[1]: `looking for a` (truncated_token:for)

### weak-form/wf-17

- clear: `That was nice`
- natural: `That was nice`
- chunks: `["That","was nice"]`

- **truncated_chunks**:
  - chunk[1]: `was nice` (truncated_token:was)

### weak-form/wf-19

- clear: `What are you doing`
- natural: `Whatcha doin'`
- chunks: `["What are you","doing"]`

- **truncated_chunks**:
  - chunk[0]: `What are you` (truncated_token:are)

### contraction/ct-05

- clear: `It's a good day`
- natural: `It's a good day`
- chunks: `["It's a","good day"]`

- **truncated_chunks**:
  - chunk[1]: `good day` (truncated_token:day)

### contraction/ct-19

- clear: `I'm not sure`
- natural: `I'm not sure`
- chunks: `["I'm","not sure"]`

- **truncated_chunks**:
  - chunk[1]: `not sure` (truncated_token:not)

### contraction/ct-20

- clear: `Where's the key`
- natural: `Where's the key`
- chunks: `["Where's","the key"]`

- **truncated_chunks**:
  - chunk[1]: `the key` (truncated_token:key)

### linking/lk-03

- clear: `Help you out`
- natural: `Help you out`
- chunks: `["Help you","out"]`

- **truncated_chunks**:
  - chunk[1]: `out` (truncated_token:out)

### linking/lk-06

- clear: `Check it out`
- natural: `Check it out`
- chunks: `["Check it","out"]`

- **truncated_chunks**:
  - chunk[1]: `out` (truncated_token:out)

### linking/lk-11

- clear: `Not at all`
- natural: `Not at all`
- chunks: `["Not at","all"]`

- **truncated_chunks**:
  - chunk[1]: `all` (truncated_token:all)

### linking/lk-14

- clear: `Get out of here`
- natural: `Get out of here`
- chunks: `["Get out of","here"]`

- **truncated_chunks**:
  - chunk[0]: `Get out of` (truncated_token:out)

### elision/el-01

- clear: `Next day`
- natural: `Nex day`
- chunks: `["Next","day"]`

- **truncated_chunks**:
  - chunk[1]: `day` (truncated_token:day)

### elision/el-14

- clear: `And the cat`
- natural: `An' the cat`
- chunks: `["And the","cat"]`

- **truncated_chunks**:
  - chunk[1]: `cat` (truncated_token:cat)

### flap/fl-13

- clear: `Not at all`
- natural: `Not at all`
- chunks: `["Not","at","all"]`

- **truncated_chunks**:
  - chunk[2]: `all` (truncated_token:all)

### stress/st-05

- clear: `We work and they rest`
- natural: `We WORK n' they REST`
- chunks: `["We","work and they","rest"]`

- **truncated_chunks**:
  - chunk[1]: `work and they` (truncated_token:and)

### stress/st-12

- clear: `I want coffee, not tea`
- natural: `I want COFfee, not TEA`
- chunks: `["I want","coffee, not","tea"]`

- **truncated_chunks**:
  - chunk[1]: `coffee, not` (truncated_token:not)
  - chunk[2]: `tea` (truncated_token:tea)

### stress/st-18

- clear: `She won the game`
- natural: `She WON the GAME`
- chunks: `["She","won the","game"]`

- **truncated_chunks**:
  - chunk[1]: `won the` (truncated_token:won)

### rhythm/rh-02

- clear: `Give me a cup of coffee`
- natural: `GIVme / a CUPa / COFfee`
- chunks: `["Give me","a cup of","coffee"]`

- **truncated_chunks**:
  - chunk[1]: `a cup of` (truncated_token:cup)

### rhythm/rh-12

- clear: `I'm looking for a new job`
- natural: `I'm LOOKing / fora NEW / JOB`
- chunks: `["I'm looking","for a new","job"]`

- **truncated_chunks**:
  - chunk[1]: `for a new` (truncated_token:for)

### rhythm/rh-14

- clear: `They live in a big house`
- natural: `They LIVE in / a BIG / HOUSE`
- chunks: `["They live in","a big","house"]`

- **truncated_chunks**:
  - chunk[1]: `a big` (truncated_token:big)

### rhythm/rh-17

- clear: `I want some ice cream`
- natural: `I want / some / ICE cream`
- chunks: `["I want","some","ice cream"]`

- **truncated_chunks**:
  - chunk[2]: `ice cream` (truncated_token:ice)

### informal/if-06

- clear: `What are you doing`
- natural: `Whatcha doing`
- chunks: `["What are you","doing"]`

- **truncated_chunks**:
  - chunk[0]: `What are you` (truncated_token:are)

### informal/if-11

- clear: `What are you going to do`
- natural: `Watcha gonna do`
- chunks: `["What are you","going to","do"]`

- **truncated_chunks**:
  - chunk[0]: `What are you` (truncated_token:are)

### informal/if-12

- clear: `You all come back`
- natural: `Y'all come back`
- chunks: `["You all","come back"]`

- **truncated_chunks**:
  - chunk[0]: `You all` (truncated_token:all)

### informal/if-16

- clear: `I have got to run`
- natural: `I gotta run`
- chunks: `["I","have got to","run"]`

- **truncated_chunks**:
  - chunk[2]: `run` (truncated_token:run)

