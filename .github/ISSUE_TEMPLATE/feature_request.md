name: Feature Request
description: File for feature request
title: "[Feature Request]: "
labels: [feature%20request]
assignees:
  - iChenLei
body:
  - type: markdown
    attributes:
      value: |
        非常感谢你向插件维护者提需求(feature request)，让插件功能更加完善!
  - type: textarea
    id: what-feature-you-need
    attributes:
      label: 新功能
      description: 新功能具体内容以及操作流程
      placeholder: 请描述具体一点，如果有代码实现思路也一并写出来，感谢！
      value: ""
    validations:
      required: true
