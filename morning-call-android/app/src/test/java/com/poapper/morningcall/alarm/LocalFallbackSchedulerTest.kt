package com.poapper.morningcall.alarm

import com.poapper.morningcall.model.Alarm
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalFallbackSchedulerTest {
    @Test
    fun emptySyncCancelsEveryPreviouslyCachedAlarm() {
        val previous = listOf(alarm("old-one"), alarm("old-two"))

        val plan = fallbackAlarmSyncPlan(previouslyCached = previous, incoming = emptyList())

        assertEquals(setOf("old-one", "old-two"), plan.alarmIdsToCancel)
        assertTrue(plan.alarmsToSchedule.isEmpty())
    }

    @Test
    fun replacementSyncCancelsOldIdsBeforeSchedulingOnlyActiveIncomingAlarms() {
        val previous = listOf(alarm("removed"), alarm("retained"))
        val incoming = listOf(
            alarm("retained"),
            alarm("new"),
            alarm("disabled", isOn = false),
        )

        val plan = fallbackAlarmSyncPlan(previouslyCached = previous, incoming = incoming)

        assertEquals(setOf("removed", "retained"), plan.alarmIdsToCancel)
        assertEquals(listOf("retained", "new"), plan.alarmsToSchedule.map { it.id })
    }

    private fun alarm(id: String, isOn: Boolean = true) = Alarm(
        id = id,
        time = "07:00",
        isOn = isOn,
        repeatDays = listOf(1),
    )
}
