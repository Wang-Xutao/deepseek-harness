/**
 * @file test_module.template.c
 * @brief Unity 模块测试骨架 — 放到 test/<rel>/test_<module>.c（与 source/<rel>/ 镜像）
 *
 * 例：source/hal/i2c.c → test/hal/test_i2c.c
 * 约定见 skill sora-c-ut-ceedling；由 /baf-quality:gen-ut 生成或补齐（不写 .gitkeep）。
 */

#include "unity.h"
#include "module.h"
/* #include "mock_dep.h" */

void setUp(void)
{
}

void tearDown(void)
{
}

void test_Module_example_behavior_returns_ok(void)
{
    /* Arrange */

    /* Act */
    /* int rc = Module_DoSomething(...); */

    /* Assert */
    /* TEST_ASSERT_EQUAL_INT(0, rc); */
    TEST_FAIL_MESSAGE("replace with real Arrange/Act/Assert");
}
